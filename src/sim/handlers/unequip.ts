/**
 * unequip — clear an equipment slot (§10). By slot, not item.
 *
 * The item stays in inventory; only the `Equipped.slots` mapping is removed, so
 * its bonuses stop flowing through `deriveStats`.
 */
import { get, type Entity } from '../../core/entity';
import type { Equipped } from '../../core/component';
import type { ActionContext, Effect } from '../../core/action';

export function unequipEffect(actorId: string, slot: string): Effect {
  return {
    kind: 'unequip',
    validate(world) {
      const actor = world.state.entities.get(actorId);
      const equipped = actor && get<Equipped>(actor, 'equipped');
      return !!equipped && equipped.slots[slot] !== undefined;
    },
    apply(world) {
      const equipped = get<Equipped>(world.state.entities.get(actorId) as Entity, 'equipped')!;
      const itemId = equipped.slots[slot]!;
      delete equipped.slots[slot];
      return [{ type: 'item:unequipped', entity: actorId, item: itemId, slot }];
    },
  };
}

export function unequipHandler(ctx: ActionContext): void {
  const slot = (ctx.action as { slot?: string }).slot;
  if (typeof slot !== 'string') {
    ctx.reject('unequip: no slot');
    return;
  }
  ctx.push(unequipEffect(ctx.action.actor, slot));
}
