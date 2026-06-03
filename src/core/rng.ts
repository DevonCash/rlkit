/**
 * rng — the seeded RNG interface (§11.1, decision §21.4).
 *
 * All engine randomness flows through a single injected `RNG`. `fork()` yields
 * an independent sub-stream so adding one consumer (e.g. a combat roll) never
 * shifts another's sequence (e.g. the map generator). The default
 * implementation is pure-rand-backed and lives in `adapters/rng.ts` — the core
 * depends only on this interface, never on pure-rand directly.
 */

/** Opaque, serializable RNG state for save/replay. */
export type RNGState = unknown;

export interface RNG {
  /** Uniform float in `[0, 1)`. */
  next(): number;
  /** Uniform integer in `[min, max]` (both inclusive). */
  int(min: number, max: number): number;
  /** Uniform choice from a non-empty array. */
  pick<T>(arr: readonly T[]): T;
  /** Return a shuffled copy of `arr` (Fisher–Yates); does not mutate input. */
  shuffle<T>(arr: readonly T[]): T[];
  /** An independent sub-stream seeded from this generator. */
  fork(): RNG;
  /** Snapshot the internal state (for save/replay). */
  getState(): RNGState;
  /** Restore a previously snapshotted state. */
  setState(s: RNGState): void;
}
