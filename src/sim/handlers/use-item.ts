/**
 * useItem — invoke a carried consumable (§10).
 *
 * Looks up the item's `Consumable.effect` in the consumable-effects registry
 * and runs it (pushing heal/status effects onto the same action), then pushes a
 * consume-charge effect that decrements `uses`. When the last charge is spent,
 * it emits `item:consumed` and then destroys the item (removed from inventory,
 * `world.state.entities`, and the query index). Everything is one atomic batch:
 * you can't heal without spending a charge or vice versa.
 */
import { get, type Entity } from '../../core/entity';
import type { Consumable, Inventory } from '../../core/component';
import type { GameEvent } from '../../core/events';
import type { ActionContext, Effect } from '../../core/action';
import type { ConsumableEffectRegistry } from '../items';

export function consumeChargeEffect(actorId: string, itemId: string): Effect {
  return {
    kind: 'consume-charge',
    validate(world) {
      const item = world.state.entities.get(itemId);
      const c = item && get<Consumable>(item, 'consumable');
      return !!c && c.uses > 0;
    },
    apply(world) {
      const item = world.state.entities.get(itemId) as Entity;
      const c = get<Consumable>(item, 'consumable')!;
      c.uses -= 1;
      const events: GameEvent[] = [{ type: 'item:used', entity: actorId, item: itemId }];
      if (c.uses <= 0) {
        // Emit the consumed event BEFORE destroying the entity.
        events.push({ type: 'item:consumed', entity: actorId, item: itemId });
        const actor = world.state.entities.get(actorId);
        const inv = actor && get<Inventory>(actor, 'inventory');
        if (inv) {
          const i = inv.items.indexOf(itemId);
          if (i >= 0) inv.items.splice(i, 1);
        }
        world.services.queries.unindex(item);
        world.state.entities.delete(itemId);
      }
      return events;
    },
  };
}

export function useItemHandler(ctx: ActionContext): void {
  const action = ctx.action as { item?: string; target?: number };
  const itemId = action.item;
  if (typeof itemId !== 'string') {
    ctx.reject('useItem: no item');
    return;
  }
  const item = ctx.world.state.entities.get(itemId);
  const consumable = item && get<Consumable>(item, 'consumable');
  if (!item || !consumable) {
    ctx.reject('useItem: item is not consumable');
    return;
  }
  const actor = ctx.world.state.entities.get(ctx.action.actor);
  const inv = actor && get<Inventory>(actor, 'inventory');
  if (!inv || !inv.items.includes(itemId)) {
    ctx.reject('useItem: item not carried');
    return;
  }
  const effects = ctx.world.services.registries.consumableEffects as
    | ConsumableEffectRegistry
    | undefined;
  const effect = effects?.tryGet(consumable.effect);
  if (!effect) {
    ctx.reject(`useItem: unknown consumable effect "${consumable.effect}"`);
    return;
  }
  effect(ctx, item, action.target);
  ctx.push(consumeChargeEffect(ctx.action.actor, itemId));
}
