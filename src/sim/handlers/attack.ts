/**
 * attack — the melee attack handler (§9.3).
 *
 * Reads attacker + defender stat blocks, runs the damage formula, and pushes a
 * single `changeResourceEffect` against the target's hp. Death and overkill
 * fall out of `changeResource`'s hp threshold + underflow. `bump` redirects to
 * this action, so a target's armor pre-reactor can reduce the pushed damage
 * effect before it applies.
 */
import type { ActionContext } from '../../core/action';
import { deriveStats } from '../stats';
import { changeResourceEffect } from '../resources';
import { defaultDamageFormula } from '../combat';

export function attackHandler(ctx: ActionContext): void {
  const action = ctx.action;
  if (action.type !== 'attack') return;
  const targetId = (action as { target?: string }).target;
  if (typeof targetId !== 'string') {
    ctx.reject('attack: no target');
    return;
  }

  const attacker = ctx.world.state.entities.get(action.actor);
  const defender = ctx.world.state.entities.get(targetId);
  if (!attacker || !defender) {
    ctx.reject('attack: missing combatant');
    return;
  }

  const atk = deriveStats(attacker, ctx.world);
  const def = deriveStats(defender, ctx.world);
  const formula = defaultDamageFormula(ctx.world.services.config.combat);
  const { amount } = formula(atk, def, ctx.world.services.rng);

  ctx.push(changeResourceEffect(targetId, 'hp', -amount, 'damage'));
}
