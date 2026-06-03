import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  cellOf,
  pointOf,
  neighbors4,
  neighbors8,
  inBounds,
} from '../../src/core/coords';

describe('coords', () => {
  test.prop([
    fc.integer({ min: 1, max: 256 }), // width
    fc.integer({ min: 1, max: 256 }), // height
  ])('cellOf/pointOf round-trip for every in-bounds point', (width, height) => {
    for (let y = 0; y < height; y += Math.max(1, (height / 8) | 0)) {
      for (let x = 0; x < width; x += Math.max(1, (width / 8) | 0)) {
        const c = cellOf({ x, y }, width);
        expect(pointOf(c, width)).toEqual({ x, y });
      }
    }
  });

  test.prop([fc.integer({ min: 2, max: 32 }), fc.integer({ min: 2, max: 32 })], {
    numRuns: 30,
  })('neighbors never wrap across row edges and stay in bounds', (width, height) => {
    // Compute a single verdict per run instead of thousands of assertions.
    let ok = true;
    for (let c = 0; c < width * height && ok; c++) {
      const cp = pointOf(c, width);
      for (const n of neighbors8(c, width, height)) {
        const p = pointOf(n, width);
        if (
          !inBounds(p, width, height) ||
          Math.abs(p.x - cp.x) > 1 ||
          Math.abs(p.y - cp.y) > 1
        ) {
          ok = false;
          break;
        }
      }
    }
    expect(ok).toBe(true);
  });

  it('corner cells have the expected reduced neighbor counts', () => {
    const w = 5;
    const h = 5;
    expect(neighbors4(cellOf({ x: 0, y: 0 }, w), w, h)).toHaveLength(2);
    expect(neighbors8(cellOf({ x: 0, y: 0 }, w), w, h)).toHaveLength(3);
    expect(neighbors4(cellOf({ x: 2, y: 2 }, w), w, h)).toHaveLength(4);
    expect(neighbors8(cellOf({ x: 2, y: 2 }, w), w, h)).toHaveLength(8);
  });

  it('left-edge cell does not list a right-edge wrap neighbor', () => {
    const w = 4;
    const h = 4;
    // cell (0,1) — its "west" would wrap to (3,0) if packed naively.
    const left = cellOf({ x: 0, y: 1 }, w);
    const ns = neighbors4(left, w, h);
    expect(ns).not.toContain(cellOf({ x: 3, y: 0 }, w));
  });
});
