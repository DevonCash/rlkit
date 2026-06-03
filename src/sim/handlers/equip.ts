/**
 * equip — wear an item the actor is carrying (§10).
 *
 * Records `Equipped.slots[slot] = itemId`; the item stays in `Inventory.items`
 * while worn. Any item already in that slot is simply replaced (it remains in
 * inventory, just unworn). Stat bonuses flow through the `equippable` mixin →
 * `deriveStats` automatically — equip pushes no stat effects itself.
 */
import { get, type Entity } from '../../core/entity';
import type { Inventory, Equipped, Equipment } from '../../core/component';
import type { ActionContext, Effect } from '../../core/action';

export function equipEffect(actorId: string, itemId: string): Effect {
  return {
    kind: 'equip',
    validate(world) {
      const actor = world.state.entities.get(actorId);
      const inv = actor && get<Inventory>(actor, 'inventory');
      const equipped = actor && get<Equipped>(actor, 'equipped');
      const item = world.state.entities.get(itemId);
      const eq = item && get<Equipment>(item, 'equipment');
      if (!actor || !inv || !equipped || !item || !eq) return false;
      if (!inv.items.includes(itemId)) return false;
      return world.services.config.equipment.slots.includes(eq.slot);
    },
    apply(world) {
      const actor = world.state.entities.get(actorId) as Entity;
      const equipped = get<Equipped>(actor, 'equipped')!;
      const eq = get<Equipment>(world.state.entities.get(itemId) as Entity, 'equipment')!;
      equipped.slots[eq.slot] = itemId;
      return [{ type: 'item:equipped', entity: actorId, item: itemId, slot: eq.slot }];
    },
  };
}

export function equipHandler(ctx: ActionContext): void {
  const itemId = (ctx.action as { item?: string }).item;
  if (typeof itemId !== 'string') {
    ctx.reject('equip: no item');
    return;
  }
  ctx.push(equipEffect(ctx.action.actor, itemId));
}
