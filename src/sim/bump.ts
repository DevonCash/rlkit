/**
 * bump — the default bump interactions (§7.2, R7).
 *
 * The engine ships ONE default rule (lowest priority): bumping a non-allied
 * occupant attacks it (the roguelike default), while an ally blocks (no friendly
 * fire). This is the attack-on-bump logic lifted out of the move handler's
 * `classify` into a registered interaction — so games can shadow it (doors,
 * lockers, corpses) or suppress it (intent-based combat) without forking movement.
 */
import type { BumpInteraction } from '../core/bump';
import { stanceBetween } from './factions';

/** Default attack-on-bump: a non-allied occupant is attacked; an ally is blocked. */
export const attackBumpInteraction: BumpInteraction = {
  priority: 0,
  claim(ctx) {
    const actor = ctx.world.state.entities.get(ctx.actor);
    const target = ctx.world.state.entities.get(ctx.target);
    if (!actor || !target) return undefined;
    if (stanceBetween(ctx.world, actor, target) === 'allied') return undefined; // ally → blocked
    return { type: 'attack', actor: ctx.actor, target: ctx.target };
  },
};
