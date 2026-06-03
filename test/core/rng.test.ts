import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { makeRng } from '../../src/adapters/rng';

describe('rng', () => {
  test.prop([fc.integer(), fc.integer({ min: 1, max: 200 })])(
    'same seed yields an identical sequence',
    (seed, n) => {
      const a = makeRng(seed);
      const b = makeRng(seed);
      for (let i = 0; i < n; i++) {
        expect(a.int(0, 1_000_000)).toBe(b.int(0, 1_000_000));
      }
    },
  );

  test.prop([fc.integer(), fc.integer({ min: 1, max: 100 })])(
    'getState/setState round-trips mid-stream',
    (seed, drawsBefore) => {
      const r = makeRng(seed);
      for (let i = 0; i < drawsBefore; i++) r.int(0, 999);
      const snapshot = r.getState();

      const continued = Array.from({ length: 20 }, () => r.int(0, 999));

      r.setState(snapshot);
      const replayed = Array.from({ length: 20 }, () => r.int(0, 999));

      expect(replayed).toEqual(continued);
    },
  );

  test.prop([fc.integer()])(
    'fork() is independent and does not perturb the parent',
    (seed) => {
      // Parent draws with a fork taken mid-stream...
      const withFork = makeRng(seed);
      withFork.int(0, 999);
      const child = withFork.fork();
      void child.int(0, 999); // exhaust the child
      const afterForkUse = [withFork.int(0, 999), withFork.int(0, 999)];

      // ...must match a parent that forked but never used the child.
      const control = makeRng(seed);
      control.int(0, 999);
      control.fork();
      const controlNext = [control.int(0, 999), control.int(0, 999)];

      expect(afterForkUse).toEqual(controlNext);
    },
  );

  test.prop([
    fc.integer(),
    fc.integer({ min: -50, max: 50 }),
    fc.integer({ min: 0, max: 50 }),
  ])('int(min,max) stays within the inclusive range', (seed, min, span) => {
    const max = min + span;
    const r = makeRng(seed);
    for (let i = 0; i < 100; i++) {
      const v = r.int(min, max);
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThanOrEqual(max);
    }
  });

  it('int over a die is approximately uniform across faces', () => {
    const r = makeRng(12345);
    const counts = new Array(6).fill(0);
    const draws = 60_000;
    for (let i = 0; i < draws; i++) counts[r.int(0, 5)]++;
    const expected = draws / 6;
    for (const c of counts) {
      expect(Math.abs(c - expected) / expected).toBeLessThan(0.1);
    }
  });

  it('next() stays in [0,1)', () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
