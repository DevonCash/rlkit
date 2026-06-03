/**
 * weighted — weighted-table selection over the seeded RNG (§11A.7).
 *
 * A `pick` draws one entry with probability proportional to its weight.
 * Deterministic per seed; weights must be non-negative with a positive sum.
 */
import type { RNG } from './rng';

export interface WeightedTable<T> {
  entries: { value: T; weight: number }[];
}

/** Pick one value from `table`, weighted by entry weight, drawing from `rng`. */
export function pick<T>(table: WeightedTable<T>, rng: RNG): T {
  const { entries } = table;
  if (entries.length === 0) throw new Error('weighted.pick: empty table');

  let total = 0;
  for (const e of entries) {
    if (e.weight < 0) throw new Error('weighted.pick: negative weight');
    total += e.weight;
  }
  if (total <= 0) throw new Error('weighted.pick: total weight must be > 0');

  // Draw in integer space [0, total) using a float in [0,1) for a fine cut.
  let target = rng.next() * total;
  for (const e of entries) {
    target -= e.weight;
    if (target < 0) return e.value;
  }
  // Floating-point guard: return the last positive-weight entry.
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i]!.weight > 0) return entries[i]!.value;
  }
  /* istanbul ignore next — unreachable given total > 0 */
  throw new Error('weighted.pick: no selectable entry');
}
