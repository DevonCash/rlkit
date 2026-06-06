/**
 * move — the movement action handler (§7.4).
 *
 * `move` is the single "step that way" intent. The handler decides what walking
 * into the target cell means:
 *   - off the map         → reject (no time; nothing to bump)
 *   - a `swappable` occupant → swap positions (two validated move effects)
 *   - any other occupant  → emit `bumped` and redirect to `attack` (so the
 *                           target's reactors fire); if nothing can attack it,
 *                           fizzle (blocked, turn spent)
 *   - empty walkable cell → relocate (emits `moved`)
 *   - a wall (no occupant)→ a FREE bump: emit `bumped`, cost 0, no relocation
 *
 * `makeMoveEffect` is the raw relocation effect, reused for relocate, swap, and
 * any forced movement (knockback/teleport) that should NOT bump.
 */
import { match } from 'ts-pattern';
import { get, set } from '../../core/entity';
import type { EntityId } from '../../core/entity';
import { cellOf, type Cell } from '../../core/coords';
import type { Position } from '../../core/component';
import type { Action, ActionContext, Effect } from '../../core/action';
import type { GameEvent } from '../../core/events';
import { isWalkable, type Level } from '../../core/level';
import type { ReadonlyWorld } from '../../core/world';
import { BLOCK } from '../../core/bump';

/** Build an effect that relocates `actorId` to `(toX,toY)` on its current level. */
export function makeMoveEffect(actorId: EntityId, toX: number, toY: number): Effect {
  return {
    kind: 'move',
    validate(world: ReadonlyWorld): boolean {
      const e = world.state.entities.get(actorId);
      const pos = e && get<Position>(e, 'position');
      if (!pos) return false;
      const level = world.state.levels.get(pos.levelId);
      if (!level) return false;
      return toX >= 0 && toX < level.width && toY >= 0 && toY < level.height;
    },
    apply(world) {
      const e = world.state.entities.get(actorId)!;
      const pos = get<Position>(e, 'position')!;
      const level = world.state.levels.get(pos.levelId)!;
      const from = cellOf({ x: pos.x, y: pos.y }, level.width);
      const to = cellOf({ x: toX, y: toY }, level.width);
      set(e, { ...pos, x: toX, y: toY });
      world.services.queries.place(actorId, pos.levelId, to);
      // Movement emits place-transition events so cell/zone/tile triggers fire
      // (§11A.5). Shared effect → relocate AND swap both emit for their mover.
      // A no-op move (forced/teleport onto the same cell) emits only `moved`, so
      // a trigger on that cell doesn't spuriously re-fire.
      const events: GameEvent[] = [{ type: 'moved', entity: actorId, from, to }];
      if (from !== to) {
        events.push({ type: 'entity:exited', entity: actorId, cell: from, levelId: pos.levelId });
        events.push({ type: 'entity:entered', entity: actorId, cell: to, levelId: pos.levelId });
      }
      return events;
    },
  };
}

/** An effect that only emits an event (no state change) — used for wall bumps. */
function announceEffect(event: GameEvent): Effect {
  return { kind: event.type, validate: () => true, apply: () => [event] };
}

type MoveOutcome =
  | { kind: 'relocate'; toX: number; toY: number }
  | { kind: 'swap'; toX: number; toY: number; other: EntityId }
  | { kind: 'interact'; action: Action; target: EntityId; cell: Cell }
  | { kind: 'blocked' }
  | { kind: 'bumpWall'; cell: Cell };

function classify(ctx: ActionContext, level: Level, toX: number, toY: number): MoveOutcome {
  const cell = cellOf({ x: toX, y: toY }, level.width);
  const pos = get<Position>(ctx.world.state.entities.get(ctx.action.actor)!, 'position')!;
  const passable = ctx.world.services.config.movement.passable;

  for (const id of ctx.world.services.queries.at(cell, pos.levelId)) {
    if (id === ctx.action.actor) continue;
    const other = ctx.world.state.entities.get(id);
    if (!other) continue;
    // Walk-over occupants (floor items, stairs) never block — keep scanning for
    // a real obstacle (a creature) sharing the cell, else fall through to relocate.
    if (passable.some((t) => other.components.has(t))) continue;
    // Swap is a movement primitive checked before the interaction channel.
    if (other.mixins.includes('swappable')) return { kind: 'swap', toX, toY, other: id };
    // What does bumping this occupant mean? Ask the bump-interaction registry
    // (R7) — the default rule attacks a non-ally; games shadow it (doors/lockers)
    // or suppress it. An Action → redirect to it; `'block'`/no claim → blocked.
    const resolved = ctx.world.services.bumpInteractions.resolve({
      world: ctx.world,
      actor: ctx.action.actor,
      target: id,
      cell,
    });
    if (resolved !== undefined && resolved !== BLOCK) return { kind: 'interact', action: resolved, target: id, cell };
    return { kind: 'blocked' };
  }

  if (isWalkable(level, cell, ctx.world.services.tiles)) return { kind: 'relocate', toX, toY };
  return { kind: 'bumpWall', cell };
}

export function moveHandler(ctx: ActionContext): void {
  const action = ctx.action;
  if (action.type !== 'move') return;
  const dir = action.dir as { x: number; y: number };

  const actor = ctx.world.state.entities.get(action.actor);
  const pos = actor && get<Position>(actor, 'position');
  if (!pos) {
    ctx.reject('move: actor has no position');
    return;
  }
  const level = ctx.world.state.levels.get(pos.levelId);
  if (!level) {
    ctx.reject('move: actor is on an unknown level');
    return;
  }
  const toX = pos.x + dir.x;
  const toY = pos.y + dir.y;
  // Reject a non-finite destination (e.g. a `NaN`/non-numeric `dir` from an
  // untrusted client) — `NaN` comparisons are false, so guard it explicitly so a
  // bad `dir` can never corrupt the actor's position.
  if (!Number.isFinite(toX) || !Number.isFinite(toY) || toX < 0 || toX >= level.width || toY < 0 || toY >= level.height) {
    ctx.reject('move: destination out of bounds');
    return;
  }

  match(classify(ctx, level, toX, toY))
    .with({ kind: 'relocate' }, ({ toX: x, toY: y }) => {
      ctx.push(makeMoveEffect(action.actor, x, y));
    })
    .with({ kind: 'swap' }, ({ toX: x, toY: y, other }) => {
      // Two effects, validated together then applied together (atomicity):
      // actor → target cell, occupant → actor's old cell.
      ctx.push(makeMoveEffect(action.actor, x, y));
      ctx.push(makeMoveEffect(other, pos.x, pos.y));
    })
    .with({ kind: 'interact' }, ({ action: interaction, target, cell }) => {
      // A bump: announce it, then re-dispatch as the resolved interaction (attack,
      // open, …) so it becomes the actor's action and its reactors fire.
      ctx.redirect(interaction, [{ type: 'bumped', entity: action.actor, cell, target }]);
    })
    .with({ kind: 'bumpWall' }, ({ cell }) => {
      // Bumping a wall is free (no turn spent) but observable.
      ctx.cost = 0;
      ctx.push(announceEffect({ type: 'bumped', entity: action.actor, cell }));
    })
    .with({ kind: 'blocked' }, () => {
      ctx.fizzle('move: blocked');
    })
    .exhaustive();
}
