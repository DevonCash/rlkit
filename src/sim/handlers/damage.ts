/**
 * damage — scripted (un-formula'd) damage action (§9.3, §11A.5).
 *
 * Where `attack` derives damage from stat blocks + the combat formula, `damage`
 * applies a FIXED amount to a target's hp — the primitive for traps, hazards,
 * falling, and scripted events that have no attacker stat block. It reuses the
 * same `changeResourceEffect` chokepoint as combat, so armor pre-reactors, the
 * `died` threshold, and overkill underflow all fire for free.
 */
import type { ActionContext } from '../../core/action';
import { changeResourceEffect } from '../resources';

export function damageHandler(ctx: ActionContext): void {
  const a = ctx.action;
  if (a.type !== 'damage') return;
  const target = (a as { target?: unknown }).target;
  const amount = (a as { amount?: unknown }).amount;
  if (typeof target !== 'string' || typeof amount !== 'number') {
    ctx.reject('damage: missing target/amount');
    return;
  }
  const cause = (a as { cause?: unknown }).cause;
  ctx.push(changeResourceEffect(target, 'hp', -Math.max(0, amount), typeof cause === 'string' ? cause : 'damage'));
}
