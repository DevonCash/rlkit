/**
 * death — the default engine reaction to `died` (§9.3).
 *
 * A global post-phase reactor that removes the dead entity from the timeline so
 * it stops taking turns. This is pure engine bookkeeping; loot drops, despawn,
 * and on-death effects are content (mixins reacting to `died`). The corpse
 * entity is left in place for that content to act on.
 */
import type { Reactor, EventReactionCtx } from '../core/reactor';

export const diedReactor: Reactor = {
  on: 'died',
  scope: 'global',
  phase: 'post',
  react(ctx) {
    const { event, world } = ctx as EventReactionCtx;
    const entity = (event as { entity?: string }).entity;
    if (typeof entity === 'string') world.services.timeline.remove(entity);
  },
};
