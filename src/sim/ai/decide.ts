/**
 * ai/decide — resolve an entity's action for its turn (§11.2).
 *
 * Iterates the entity's mixins in declared order and returns the first
 * `takeTurn` that yields an action (a priority stack — e.g. aiHunter before
 * aiWanderer). `undefined` means no mixin decided; the driver (M7) then waits.
 * The driver feeds the returned action to `resolve`/`perform`.
 */
import { resolveMixins, mixinRegistryOf } from '../../core/mixin';
import type { Action } from '../../core/action';
import type { ReadonlyWorld } from '../../core/world';

export function decideAction(world: ReadonlyWorld, entityId: string): Action | undefined {
  const entity = world.state.entities.get(entityId);
  if (!entity) return undefined;
  for (const mixin of resolveMixins(entity, mixinRegistryOf(world))) {
    const action = mixin.takeTurn?.(entity, world);
    if (action) return action;
  }
  return undefined;
}
