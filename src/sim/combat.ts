/**
 * combat — a consumer of the primitives (§9.3).
 *
 * The damage formula turns attacker/defender stat blocks into a number; the
 * effect is `changeResource(target, 'hp', -amount, 'damage')`. Resistances and
 * armor are just stats the formula reads (e.g. `defense`). Death is the `hp`
 * threshold `{at:0, emit:'died'}` — fired by `changeResource`, not here — so
 * every hp-zeroing path (poison, hazards) kills for free.
 *
 * The formula is logic; its coefficients/variance are config (`config.combat`).
 */
import type { RNG } from '../core/rng';
import type { StatBlock } from '../core/stats';
import type { Config } from '../config/defaults';

export interface DamageResult {
  amount: number;
}

export type DamageFormula = (attacker: StatBlock, defender: StatBlock, rng: RNG) => DamageResult;

/** The default formula: `attack − defense + [0,variance]`, floored at minDamage. */
export function defaultDamageFormula(cfg: Config['combat']): DamageFormula {
  return (attacker, defender, rng) => {
    const attack = attacker.attack ?? 0;
    const defense = defender.defense ?? 0;
    const variance = cfg.variance > 0 ? rng.int(0, cfg.variance) : 0;
    const amount = Math.max(cfg.minDamage, attack - defense + variance);
    return { amount };
  };
}
