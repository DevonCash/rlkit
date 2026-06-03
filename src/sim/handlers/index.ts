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
import { bumpHandler } from './bump';

export { moveHandler } from './move';
export { waitHandler } from './wait';
export { bumpHandler } from './bump';
export { makeMoveEffect } from './move';

/** Register the engine's built-in handlers. Call once at world assembly. */
export function registerCoreHandlers(registry: Registry<ActionHandler>): void {
  registry.register('move', moveHandler);
  registry.register('wait', waitHandler);
  registry.register('bump', bumpHandler);
}
