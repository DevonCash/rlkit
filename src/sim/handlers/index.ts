/**
 * handlers — the built-in action handlers + registration (§7.4).
 *
 * Handlers are registered (and overridable) in the `handlers` registry. Content
 * can register new action types or replace a built-in by id. `resolve()` looks
 * the handler up by `action.type`.
 */
import type { Registry } from '../../core/registry';
import type { ActionHandler } from '../../core/action';
import { moveHandler } from './move';
import { waitHandler } from './wait';
import { attackHandler } from './attack';
import { damageHandler } from './damage';
import { pickupHandler } from './pickup';
import { dropHandler } from './drop';
import { equipHandler } from './equip';
import { unequipHandler } from './unequip';
import { useItemHandler } from './use-item';

export { moveHandler } from './move';
export { waitHandler } from './wait';
export { attackHandler } from './attack';
export { damageHandler } from './damage';
export { pickupHandler } from './pickup';
export { dropHandler } from './drop';
export { equipHandler } from './equip';
export { unequipHandler } from './unequip';
export { useItemHandler } from './use-item';
export { makeMoveEffect } from './move';

/** Register the engine's built-in handlers. Call once at world assembly. */
export function registerCoreHandlers(registry: Registry<ActionHandler>): void {
  registry.register('move', moveHandler);
  registry.register('wait', waitHandler);
  registry.register('attack', attackHandler);
  registry.register('damage', damageHandler);
  registry.register('pickup', pickupHandler);
  registry.register('drop', dropHandler);
  registry.register('equip', equipHandler);
  registry.register('unequip', unequipHandler);
  registry.register('useItem', useItemHandler);
}
