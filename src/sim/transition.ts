/**
 * transition — level-to-level movement: descend / ascend (§8.2).
 *
 * Multi-level dungeons are a list of `Level`s linked by `stairs` entities. The
 * engine owns the *mechanic* of moving an actor between levels; the game owns
 * *which* level exists and how it looks (via `services.levelProvider`).
 *
 * The mechanic, all inside one effect (the sole writer):
 *   1. relocate the actor's `position` to the destination cell+level and
 *      re-index it in the spatial index,
 *   2. swap timeline membership by level — every turn-taker (an entity with an
 *      `allegiance`) on the level being LEFT is removed from the timeline, and
 *      every turn-taker now on the level being ENTERED is (re)added — so AI and
 *      per-turn work stay scoped to the active level while off-level actors
 *      freeze with their state intact (persistent levels),
 *   3. emit `entity:changed-level`.
 *
 * The player's FOV is recomputed by the driver after the (player) turn, so the
 * effect does not touch visibility — which keeps it agnostic about who the
 * single FOV viewer is.
 */
import { get, set, type Entity } from '../core/entity';
import type { Position, Stairs } from '../core/component';
import { cellOf, pointOf } from '../core/coords';
import type { ActionContext, Effect } from '../core/action';
import type { GameEvent } from '../core/events';
import type { World, ReadonlyWorld, LevelLink } from '../core/world';
import { deriveStat } from './stats';

/** Resolve the destination of a stairs entity, building it lazily if needed. */
function resolveDestination(world: World, stairs: Stairs, from: LevelLink): LevelLink | undefined {
  if (stairs.to) return stairs.to;
  const provider = world.services.levelProvider;
  if (!provider) return undefined;
  const fromLevel = world.state.levels.get(from.levelId);
  const depth = (fromLevel?.metadata.depth as number | undefined) ?? 0;
  const link = provider(world, { depth: dir(stairs) === 'down' ? depth + 1 : depth - 1, dir: dir(stairs), from });
  if (link) stairs.to = link; // memoize the link so the next use is direct
  return link;
}

function dir(stairs: Stairs): 'up' | 'down' {
  return stairs.dir;
}

/**
 * The sole writer for a level change. Reads the linked `stairs` entity (building
 * + linking the destination via the level provider on first use), relocates the
 * actor, and swaps timeline membership between the two levels.
 */
export function transitionEffect(actorId: string, stairsId: string): Effect {
  return {
    kind: 'transition',
    validate(world: ReadonlyWorld): boolean {
      const actor = world.state.entities.get(actorId);
      const pos = actor && get<Position>(actor, 'position');
      const stairsEnt = world.state.entities.get(stairsId);
      const stairs = stairsEnt && get<Stairs>(stairsEnt, 'stairs');
      if (!pos || !stairs) return false;
      // A concrete link is reachable now; an unlinked stair needs a provider.
      return stairs.to !== undefined || world.services.levelProvider !== undefined;
    },
    apply(world: World): GameEvent[] {
      const actor = world.state.entities.get(actorId) as Entity;
      const pos = get<Position>(actor, 'position')!;
      const stairs = get<Stairs>(world.state.entities.get(stairsId) as Entity, 'stairs')!;
      const fromLevelId = pos.levelId;
      const fromCell = cellOf({ x: pos.x, y: pos.y }, world.state.levels.get(fromLevelId)!.width);

      const dest = resolveDestination(world, stairs, { levelId: fromLevelId, cell: fromCell });
      if (!dest) return []; // gated by validate; defensive

      const toLevel = world.state.levels.get(dest.levelId);
      if (!toLevel) return [];
      const { x, y } = pointOf(dest.cell, toLevel.width);

      // 1. Relocate the actor and re-index it on the destination level.
      set(actor, { ...pos, x, y, levelId: dest.levelId });
      world.services.queries.place(actorId, dest.levelId, dest.cell);

      // 2. Swap timeline membership by level. The actor has already moved, so it
      //    no longer matches `fromLevelId`; re-adding it on the entered level is
      //    a no-op (addActor is idempotent).
      const timeline = world.services.timeline;
      for (const e of world.services.queries.with('position', 'allegiance')) {
        const p = get<Position>(e, 'position')!;
        if (p.levelId === fromLevelId) timeline.remove(e.id);
        else if (p.levelId === dest.levelId) timeline.addActor(e.id, deriveStat(e, world, 'speed'));
      }

      return [
        {
          type: 'entity:changed-level',
          entity: actorId,
          from: fromLevelId,
          to: dest.levelId,
          cell: dest.cell,
        },
      ];
    },
  };
}

/** Find a stairs entity at the actor's cell whose direction matches `want`. */
function stairsAtActor(ctx: ActionContext, want: 'up' | 'down'): string | undefined {
  const actor = ctx.world.state.entities.get(ctx.action.actor);
  const pos = actor && get<Position>(actor, 'position');
  if (!pos) return undefined;
  const level = ctx.world.state.levels.get(pos.levelId);
  if (!level) return undefined;
  const cell = cellOf({ x: pos.x, y: pos.y }, level.width);
  for (const id of ctx.world.services.queries.at(cell, pos.levelId)) {
    const e = ctx.world.state.entities.get(id);
    const stairs = e && get<Stairs>(e, 'stairs');
    if (stairs && stairs.dir === want) return id;
  }
  return undefined;
}

function transitionHandler(want: 'up' | 'down', verb: string) {
  return (ctx: ActionContext): void => {
    const stairsId = stairsAtActor(ctx, want);
    if (!stairsId) {
      ctx.reject(`${verb}: no ${want} stairs here`);
      return;
    }
    ctx.push(transitionEffect(ctx.action.actor, stairsId));
  };
}

/** Walk down the stairs the actor is standing on. */
export const descendHandler = transitionHandler('down', 'descend');
/** Walk up the stairs the actor is standing on. */
export const ascendHandler = transitionHandler('up', 'ascend');
