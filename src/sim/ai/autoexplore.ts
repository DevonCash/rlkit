/**
 * autoexplore — roll downhill toward the nearest unexplored frontier (§11.3.6).
 *
 * A goal field whose goals are unexplored tiles (undiscovered walls treated as
 * floor so the frontier is reachable); the actor steps downhill toward the
 * closest unknown. Returns the next step as a `bump`, or `undefined` when the
 * reachable map is fully explored. Halting on a new message / newly-seen monster
 * is the driver's concern (M7) — this just yields the next step.
 */
import { get, type Entity } from '../../core/entity';
import type { Position } from '../../core/component';
import type { Action } from '../../core/action';
import { cellOf } from '../../core/coords';
import type { World } from '../../core/world';

const AUTOEXPLORE_FIELD = 'autoexplore';

export function autoexploreStep(world: World, actorId: string): Action | undefined {
  const actor: Entity | undefined = world.state.entities.get(actorId);
  const pos = actor && get<Position>(actor, 'position');
  const level = pos && world.state.levels.get(pos.levelId);
  if (!actor || !pos || !level) return undefined;

  const store = world.services.fields.forLevel(pos.levelId);
  store.ensure({
    id: AUTOEXPLORE_FIELD,
    kind: 'goal',
    params: { source: { kind: 'unexplored' }, passUnexplored: true },
  });
  store.markDirty(AUTOEXPLORE_FIELD); // the explored frontier shifts every step

  const field = store.data(AUTOEXPLORE_FIELD);
  const here = cellOf({ x: pos.x, y: pos.y }, level.width);
  const step = store.bestStep(field, here);
  if (step < 0) return undefined; // nothing left to explore (or no reachable frontier)

  const tx = step % level.width;
  const ty = (step / level.width) | 0;
  return { type: 'bump', actor: actorId, dir: { x: Math.sign(tx - pos.x), y: Math.sign(ty - pos.y) } };
}
