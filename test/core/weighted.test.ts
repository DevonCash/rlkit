import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { pick, type WeightedTable } from '../../src/core/weighted';
import { makeRng } from '../../src/adapters/rng';

describe('weighted', () => {
  it('approximates the configured distribution', () => {
    const table: WeightedTable<string> = {
      entries: [
        { value: 'common', weight: 70 },
        { value: 'uncommon', weight: 25 },
        { value: 'rare', weight: 5 },
      ],
    };
    const r = makeRng(99);
    const counts: Record<string, number> = { common: 0, uncommon: 0, rare: 0 };
    const draws = 100_000;
    for (let i = 0; i < draws; i++) counts[pick(table, r)]!++;

    expect(Math.abs(counts.common! / draws - 0.7)).toBeLessThan(0.02);
    expect(Math.abs(counts.uncommon! / draws - 0.25)).toBeLessThan(0.02);
    expect(Math.abs(counts.rare! / draws - 0.05)).toBeLessThan(0.02);
  });

  test.prop([fc.integer()])('is deterministic per seed', (seed) => {
    const table: WeightedTable<number> = {
      entries: [
        { value: 1, weight: 3 },
        { value: 2, weight: 1 },
        { value: 3, weight: 2 },
      ],
    };
    const a = makeRng(seed);
    const b = makeRng(seed);
    for (let i = 0; i < 30; i++) expect(pick(table, b)).toBe(pick(table, a));
  });

  it('never selects a zero-weight entry', () => {
    const table: WeightedTable<string> = {
      entries: [
        { value: 'never', weight: 0 },
        { value: 'always', weight: 1 },
      ],
    };
    const r = makeRng(3);
    for (let i = 0; i < 1000; i++) expect(pick(table, r)).toBe('always');
  });

  it('rejects empty tables and non-positive total weight', () => {
    const r = makeRng(1);
    expect(() => pick({ entries: [] }, r)).toThrow();
    expect(() => pick({ entries: [{ value: 'x', weight: 0 }] }, r)).toThrow();
    expect(() => pick({ entries: [{ value: 'x', weight: -1 }] }, r)).toThrow();
  });
});
