/**
 * adapters/rng — pure-rand-backed RNG implementation (§21.4).
 *
 * pure-rand v8 is subpath-only and stateful: `uniformInt(gen, from, to)` draws
 * an inclusive integer and mutates `gen`; the generator exposes `getState()` /
 * `xoroshiro128plusFromState()` for exact snapshot+restore. This is the only
 * place pure-rand is imported — the rest of the engine sees the `RNG` interface.
 */
import {
  xoroshiro128plus,
  xoroshiro128plusFromState,
} from 'pure-rand/generator/xoroshiro128plus';
import { uniformInt } from 'pure-rand/distribution/uniformInt';
import type { RandomGenerator } from 'pure-rand/types/RandomGenerator';
import type { RNG, RNGState } from '../core/rng';

const U32 = 0x1_0000_0000; // 2^32

class PureRandRNG implements RNG {
  private gen: RandomGenerator;

  constructor(gen: RandomGenerator) {
    this.gen = gen;
  }

  next(): number {
    // Map a full 32-bit draw into [0, 1).
    return (uniformInt(this.gen, 0, U32 - 1) >>> 0) / U32;
  }

  int(min: number, max: number): number {
    if (max < min) throw new Error(`RNG.int: max (${max}) < min (${min})`);
    return uniformInt(this.gen, min, max);
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('RNG.pick: empty array');
    return arr[this.int(0, arr.length - 1)]!;
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp;
    }
    return out;
  }

  fork(): RNG {
    // Seed a child from a draw so the child cannot perturb the parent stream
    // and vice versa.
    const seed = uniformInt(this.gen, 0, 0x7fff_ffff);
    return new PureRandRNG(xoroshiro128plus(seed));
  }

  getState(): RNGState {
    // getState() is read-only; copy so callers can't mutate our internals.
    return this.gen.getState().slice();
  }

  setState(s: RNGState): void {
    this.gen = xoroshiro128plusFromState(s as number[]);
  }
}

/** Create a seeded RNG. Same seed → identical sequence. */
export function makeRng(seed: number): RNG {
  return new PureRandRNG(xoroshiro128plus(seed));
}
