/**
 * combatModule — hit/miss, criticals, and kill attribution (opt-in §6.4).
 *
 * Overrides the core `attack` handler with one that rolls to-hit (attacker
 * `accuracy` vs defender `evasion`) and a critical multiplier through the seeded
 * RNG, and records who dealt the blow (a `damaged-by` component on the victim +
 * a `by` field on `damaged`/`missed` events) so `progressionModule` can credit
 * kills. With default options and no accuracy/evasion stats in play it draws the
 * RNG identically to core combat, so it is a behaviour-preserving drop-in.
 */
import { get, set } from '../core/entity';
import type { Effect, ActionContext, ActionHandler } from '../core/action';
import type { Registry } from '../core/registry';
import type { Module } from '../core/module';
import type { ReadonlyWorld } from '../core/world';
import { deriveStats, type StatDef } from '../sim/stats';
import { changeResourceEffect } from '../sim/resources';
import { defaultDamageFormula } from '../sim/combat';

export interface CombatOptions {
  /** Probability [0,1] a hit is critical (default 0 = never; no RNG draw). */
  critChance?: number;
  /** Damage multiplier on a critical (default 2). */
  critMultiplier?: number;
  /** Hit-chance lost per point of (evasion − accuracy) (default 0.1). */
  evasionFactor?: number;
  /** Floor on hit probability (default 0.1). */
  minHit?: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Tag the victim with its last attacker and announce the hit (carries `by`). */
function announceHit(targetId: string, by: string, amount: number, crit: boolean): Effect {
  return {
    kind: 'damaged',
    validate: () => true,
    apply(world) {
      const t = world.state.entities.get(targetId);
      if (t) set(t, { type: 'damaged-by', id: by });
      return [{ type: 'damaged', entity: targetId, amount, crit, by }];
    },
  };
}

function announceMiss(targetId: string, by: string): Effect {
  return { kind: 'missed', validate: () => true, apply: () => [{ type: 'missed', entity: targetId, by }] };
}

export function combatModule(opts: CombatOptions = {}): Module {
  const critChance = opts.critChance ?? 0;
  const critMultiplier = opts.critMultiplier ?? 2;
  const evasionFactor = opts.evasionFactor ?? 0.1;
  const minHit = opts.minHit ?? 0.1;

  const attack: ActionHandler = (ctx: ActionContext) => {
    const action = ctx.action;
    if (action.type !== 'attack') return;
    const targetId = (action as { target?: string }).target;
    if (typeof targetId !== 'string') return void ctx.reject('attack: no target');

    const attacker = ctx.world.state.entities.get(action.actor);
    const defender = ctx.world.state.entities.get(targetId);
    if (!attacker || !defender) return void ctx.reject('attack: missing combatant');

    const atk = deriveStats(attacker, ctx.world);
    const def = deriveStats(defender, ctx.world);
    const rng = ctx.world.services.rng;

    // To-hit: only draws when the defender actually has an evasion edge.
    const hitP = clamp(1 - Math.max(0, (def.evasion ?? 0) - (atk.accuracy ?? 0)) * evasionFactor, minHit, 1);
    if (hitP < 1 && rng.next() >= hitP) {
      ctx.push(announceMiss(targetId, action.actor));
      return;
    }

    const base = defaultDamageFormula(ctx.world.services.config.combat)(atk, def, rng).amount;
    const crit = critChance > 0 && rng.next() < critChance;
    const amount = crit ? Math.round(base * critMultiplier) : base;

    ctx.push(changeResourceEffect(targetId, 'hp', -amount, 'damage'));
    ctx.push(announceHit(targetId, action.actor, amount, crit));
  };

  return {
    id: 'combat',
    setup(world) {
      const stats = world.services.registries.stats as Registry<StatDef>;
      if (!stats.has('accuracy')) stats.register('accuracy', { id: 'accuracy', default: 0 });
      if (!stats.has('evasion')) stats.register('evasion', { id: 'evasion', default: 0 });
      (world.services.registries.handlers as Registry<ActionHandler>).override('attack', attack);
    },
  };
}

/** Read the last attacker recorded on an entity by {@link combatModule}, if any. */
export function lastAttackerOf(world: ReadonlyWorld, victimId: string): string | undefined {
  const e = world.state.entities.get(victimId);
  const tag = e && get<{ type: 'damaged-by'; id: string }>(e, 'damaged-by');
  return tag?.id;
}
