/**
 * stats — derived-scalar types (§9.1).
 *
 * `StatBlock` is the resolved output; `StatModifier` is a single typed
 * contribution. These live in `core` (not `sim`) because the `Mixin` interface
 * references `StatModifier` in `modifyStats` — the same reason the action spine
 * types live in core. The derivation *logic* (`deriveStats`) lives in
 * `sim/stats.ts`.
 *
 * Modifiers are gathered in mixin declaration order but APPLIED in a fixed
 * phase order — base → additive → multiplicative → clamp — so a `+5` and a
 * `×1.2` never fight over sequence (and shuffling modifiers can't change the
 * result; §22.7).
 */

/** A resolved set of named stat values. */
export interface StatBlock {
  [stat: string]: number;
}

/** A single contribution to a stat, applied in its phase. */
export interface StatModifier {
  stat: string;
  phase: 'add' | 'mul';
  amount: number;
}
