/**
 * drop — move a carried item back onto the floor at the actor's cell (§10).
 *
 * The inverse of pickup: the item id leaves `Inventory.items` and the entity
 * regains a `position` (rejoining the spatial index) at the actor's location.
 */
import { get, set, type Entity } from '../../core/entity';
import type { Position, Inventory } from '../../core/component';
import { cellOf } from '../../core/coords';
import type { ActionContext, Effect } from '../../core/action';

export function dropEffect(actorId: string, itemId: string): Effect {
  return {
    kind: 'drop',
    validate(world) {
      const actor = world.state.entities.get(actorId);
      const actorPos = actor && get<Position>(actor, 'position');
      const inv = actor && get<Inventory>(actor, 'inventory');
      const level = actorPos && world.state.levels.get(actorPos.levelId);
      if (!actor || !actorPos || !inv || !level) return false;
      return inv.items.includes(itemId) && world.state.entities.has(itemId);
    },
    apply(world) {
      const actor = world.state.entities.get(actorId) as Entity;
      const actorPos = get<Position>(actor, 'position')!;
      const inv = get<Inventory>(actor, 'inventory')!;
      const item = world.state.entities.get(itemId) as Entity;
      const level = world.state.levels.get(actorPos.levelId)!;

      const i = inv.items.indexOf(itemId);
      if (i >= 0) inv.items.splice(i, 1);
      set(item, { type: 'position', x: actorPos.x, y: actorPos.y, levelId: actorPos.levelId });
      world.services.queries.onComponentAdded(item, 'position');
      world.services.queries.place(itemId, actorPos.levelId, cellOf({ x: actorPos.x, y: actorPos.y }, level.width));
      return [{ type: 'item:dropped', entity: actorId, item: itemId }];
    },
  };
}

export function dropHandler(ctx: ActionContext): void {
  const itemId = (ctx.action as { item?: string }).item;
  if (typeof itemId !== 'string') {
    ctx.reject('drop: no item');
    return;
  }
  ctx.push(dropEffect(ctx.action.actor, itemId));
}
