import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { roll } from '../../src/core/dice';
import { makeRng } from '../../src/adapters/rng';

describe('dice', () => {
  test.prop([fc.integer()])('"2d6+3" stays within [5,15] and is deterministic', (seed) => {
    const a = makeRng(seed);
    const b = makeRng(seed);
    for (let i = 0; i < 50; i++) {
      const v = roll('2d6+3', a);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(15);
      expect(roll('2d6+3', b)).toBe(v); // deterministic per seed
    }
  });

  it('parses count, sides, and signed modifiers', () => {
    const r = makeRng(1);
    expect(roll('1d1', r)).toBe(1);
    expect(roll('3d1', r)).toBe(3);
    expect(roll('3d1-1', r)).toBe(2);
    expect(roll('d1', r)).toBe(1); // implicit count of 1
    expect(roll('2d1 + 5', r)).toBe(7);
  });

  it('throws on malformed expressions', () => {
    const r = makeRng(1);
    expect(() => roll('', r)).toThrow();
    expect(() => roll('2x6', r)).toThrow();
    expect(() => roll('d0', r)).toThrow();
    expect(() => roll('0d6', r)).toThrow();
  });
});
