/**
 * pickup — move a floor item into the actor's inventory (§10).
 *
 * The item entity persists; only its *location* changes: its `position` is
 * removed (so it leaves the spatial index) and its id joins the carrier's
 * `Inventory.items`. Capacity/weight are enforced atomically in the effect's
 * `validate`, so a full pack rejects with no mutation.
 */
import { get, remove, type Entity } from '../../core/entity';
import type { Position, Inventory } from '../../core/component';
import type { ActionContext, Effect } from '../../core/action';
import { canCarry } from '../items';

function samePlace(a: Position, b: Position): boolean {
  return a.levelId === b.levelId && a.x === b.x && a.y === b.y;
}

export function pickupEffect(actorId: string, itemId: string): Effect {
  return {
    kind: 'pickup',
    validate(world) {
      const item = world.state.entities.get(itemId);
      const itemPos = item && get<Position>(item, 'position');
      const actor = world.state.entities.get(actorId);
      const actorPos = actor && get<Position>(actor, 'position');
      const inv = actor && get<Inventory>(actor, 'inventory');
      if (!item || !itemPos || !actor || !actorPos || !inv) return false;
      if (!samePlace(itemPos, actorPos)) return false;
      return canCarry(actor, item, world, world.services.config);
    },
    apply(world) {
      const item = world.state.entities.get(itemId) as Entity;
      const actor = world.state.entities.get(actorId) as Entity;
      const inv = get<Inventory>(actor, 'inventory')!;
      remove(item, 'position');
      world.services.queries.onComponentRemoved(item, 'position');
      world.services.queries.clearPosition(itemId);
      inv.items.push(itemId);
      return [{ type: 'item:picked', entity: actorId, item: itemId }];
    },
  };
}

export function pickupHandler(ctx: ActionContext): void {
  const itemId = (ctx.action as { item?: string }).item;
  if (typeof itemId !== 'string') {
    ctx.reject('pickup: no item');
    return;
  }
  ctx.push(pickupEffect(ctx.action.actor, itemId));
}
