/**
 * dice — dice-expression rolls over the seeded RNG (§11A.6).
 *
 * Grammar: `NdM±K` — N dice of M sides, plus an optional flat modifier.
 *   "2d6+3", "1d20", "3d4-1", "d6" (N defaults to 1).
 * All randomness flows through the injected `RNG`, so a roll is deterministic
 * per seed.
 */
import type { RNG } from './rng';

const DICE_RE = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i;

/** Roll a dice expression, drawing from `rng`. Throws on malformed input. */
export function roll(expr: string, rng: RNG): number {
  const m = DICE_RE.exec(expr);
  if (!m) throw new Error(`dice.roll: malformed expression "${expr}"`);

  const count = m[1] === '' ? 1 : Number.parseInt(m[1]!, 10);
  const sides = Number.parseInt(m[2]!, 10);
  const modifier = m[3] ? Number.parseInt(m[3].replace(/\s+/g, ''), 10) : 0;

  if (count < 1) throw new Error(`dice.roll: dice count must be >= 1 in "${expr}"`);
  if (sides < 1) throw new Error(`dice.roll: die sides must be >= 1 in "${expr}"`);

  let total = modifier;
  for (let i = 0; i < count; i++) {
    total += rng.int(1, sides);
  }
  return total;
}
