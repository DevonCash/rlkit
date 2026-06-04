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
import type { ActionContext, Effect } from '../../core/action';
import type { GameEvent } from '../../core/events';
import { isWalkable, type Level } from '../../core/level';
import type { ReadonlyWorld } from '../../core/world';

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
      return [
        { type: 'moved', entity: actorId, from, to },
        { type: 'entity:exited', entity: actorId, cell: from, levelId: pos.levelId },
        { type: 'entity:entered', entity: actorId, cell: to, levelId: pos.levelId },
      ];
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
  | { kind: 'attack'; target: EntityId; cell: Cell }
  | { kind: 'blocked' }
  | { kind: 'bumpWall'; cell: Cell };

function classify(ctx: ActionContext, level: Level, toX: number, toY: number): MoveOutcome {
  const cell = cellOf({ x: toX, y: toY }, level.width);
  const pos = get<Position>(ctx.world.state.entities.get(ctx.action.actor)!, 'position')!;

  for (const id of ctx.world.services.queries.at(cell, pos.levelId)) {
    if (id === ctx.action.actor) continue;
    const other = ctx.world.state.entities.get(id);
    if (other && other.mixins.includes('swappable')) return { kind: 'swap', toX, toY, other: id };
    if (ctx.world.services.registries.handlers?.has('attack')) return { kind: 'attack', target: id, cell };
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
  if (toX < 0 || toX >= level.width || toY < 0 || toY >= level.height) {
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
    .with({ kind: 'attack' }, ({ target, cell }) => {
      // A bump: announce it, then re-dispatch as an attack so reactors fire.
      ctx.redirect({ type: 'attack', actor: action.actor, target }, [
        { type: 'bumped', entity: action.actor, cell, target },
      ]);
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
