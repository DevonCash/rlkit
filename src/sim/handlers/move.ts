/**
 * move — the move action handler (§7.4).
 *
 * Moves the actor one step in `dir`. Preconditions (entity has a position, its
 * level exists, the destination is in bounds) are checked in the handler and
 * `reject` an invalid move (no time passes). Walkability/tile checks arrive
 * with the tile registry in milestone 3; M2 bounds-checks only.
 */
import { get, set } from '../../core/entity';
import type { EntityId } from '../../core/entity';
import { cellOf } from '../../core/coords';
import type { Position } from '../../core/component';
import type { ActionContext, Effect } from '../../core/action';
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
      return [{ type: 'moved', entity: actorId, from, to }];
    },
  };
}

export function moveHandler(ctx: ActionContext): void {
  const action = ctx.action;
  if (action.type !== 'move') return;
  const dir = action.dir as { x: number; y: number };

  const e = ctx.world.state.entities.get(action.actor);
  const pos = e && get<Position>(e, 'position');
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
  ctx.push(makeMoveEffect(action.actor, toX, toY));
}
