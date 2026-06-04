import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { line, hasLoS, cellsIn } from '../../src/core/geometry';
import { createLevel, setTile, levelCell } from '../../src/core/level';
import { createTilePalette } from '../../src/core/tiles';
import { cellOf, type Point } from '../../src/core/coords';

function palette() {
  const p = createTilePalette();
  p.register({ id: 'wall', walkable: false, transparent: false, glyph: '#', fg: '#888' }); // 0
  p.register({ id: 'floor', walkable: true, transparent: true, glyph: '.', fg: '#ccc' }); // 1
  return p;
}

describe('line (§22.3)', () => {
  it('includes both endpoints in order', () => {
    const pts = line({ x: 0, y: 0 }, { x: 3, y: 0 });
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts.at(-1)).toEqual({ x: 3, y: 0 });
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  test.prop([
    fc.record({ x: fc.integer({ min: 0, max: 40 }), y: fc.integer({ min: 0, max: 40 }) }),
    fc.record({ x: fc.integer({ min: 0, max: 40 }), y: fc.integer({ min: 0, max: 40 }) }),
  ])('endpoints are always first and last', (a: Point, b: Point) => {
    const pts = line(a, b);
    expect(pts[0]).toEqual(a);
    expect(pts.at(-1)).toEqual(b);
  });
});

describe('hasLoS (§22.3)', () => {
  it('is clear across open floor and blocked by an opaque wall', () => {
    const p = palette();
    const lvl = createLevel('L', 7, 3, p.index('floor'));
    const a = { x: 0, y: 1 };
    const b = { x: 6, y: 1 };
    expect(hasLoS(lvl, a, b, p)).toBe(true);

    setTile(lvl, levelCell(lvl, 3, 1), p.index('wall')); // opaque wall mid-line
    expect(hasLoS(lvl, a, b, p)).toBe(false);
  });

  it('sees the wall it is looking at (endpoint exempt)', () => {
    const p = palette();
    const lvl = createLevel('L', 5, 1, p.index('floor'));
    setTile(lvl, levelCell(lvl, 4, 0), p.index('wall'));
    expect(hasLoS(lvl, { x: 0, y: 0 }, { x: 4, y: 0 }, p)).toBe(true);
  });
});

describe('cellsIn (§22.3)', () => {
  test.prop([fc.integer({ min: 1, max: 6 })])('blast stays within bounds and radius', (r) => {
    const width = 20;
    const height = 20;
    const origin = { x: 10, y: 10 };
    const cells = cellsIn(origin, { kind: 'blast', radius: r }, { width, height });
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(width);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(height);
      expect(Math.hypot(c.x - origin.x, c.y - origin.y)).toBeLessThanOrEqual(r + 1e-9);
    }
    expect(cells).toContainEqual(origin);
  });

  it('clips a blast to the grid corner', () => {
    const cells = cellsIn({ x: 0, y: 0 }, { kind: 'blast', radius: 2 }, { width: 10, height: 10 });
    expect(cells.every((c) => c.x >= 0 && c.y >= 0)).toBe(true);
  });

  it('beam walks in a direction for range steps', () => {
    const cells = cellsIn({ x: 1, y: 1 }, { kind: 'beam', dir: { x: 1, y: 0 }, range: 3 }, { width: 10, height: 10 });
    expect(cells).toEqual([
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
    ]);
  });

  it('cone covers cells ahead within the half-angle and range, none behind', () => {
    const width = 20;
    const height = 20;
    const origin = { x: 10, y: 10 };
    const cells = cellsIn(origin, { kind: 'cone', dir: { x: 1, y: 0 }, angle: Math.PI / 2, range: 4 }, { width, height });
    expect(cells).toContainEqual({ x: 12, y: 10 }); // straight ahead
    expect(cells).not.toContainEqual({ x: 8, y: 10 }); // directly behind
    expect(cells).not.toContainEqual(origin); // origin excluded
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(width);
      expect(Math.hypot(c.x - origin.x, c.y - origin.y)).toBeLessThanOrEqual(4 + 1e-9);
      expect(c.x).toBeGreaterThanOrEqual(origin.x); // all within the +x half
    }
  });

  test.prop([fc.integer({ min: 1, max: 6 })])('ring is exactly the cells at rounded distance r', (r) => {
    const width = 24;
    const height = 24;
    const origin = { x: 12, y: 12 };
    const cells = cellsIn(origin, { kind: 'ring', radius: r }, { width, height });
    expect(cells).not.toContainEqual(origin);
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(width);
      expect(Math.round(Math.hypot(c.x - origin.x, c.y - origin.y))).toBe(r);
    }
    expect(cells).toContainEqual({ x: origin.x + r, y: origin.y }); // the cardinal point
  });

  it('cone excludes cells occluded by a wall when blocks is configured', () => {
    const width = 20;
    const height = 3;
    const origin = { x: 10, y: 1 };
    const blocked = (cell: number) => cell === cellOf({ x: 11, y: 1 }, width);
    const open = cellsIn(origin, { kind: 'cone', dir: { x: 1, y: 0 }, angle: Math.PI / 2, range: 3 }, { width, height });
    const occluded = cellsIn(origin, { kind: 'cone', dir: { x: 1, y: 0 }, angle: Math.PI / 2, range: 3 }, { width, height, blocks: blocked });
    expect(open).toContainEqual({ x: 13, y: 1 });
    expect(occluded).not.toContainEqual({ x: 13, y: 1 }); // behind the wall along +x
  });

  it('excludes cells occluded by a wall when blocks is configured', () => {
    const width = 20;
    const height = 3;
    const origin = { x: 10, y: 1 };
    // A single blocking cell at (11,1), directly +x of the origin.
    const blocked = (cell: number) => cell === cellOf({ x: 11, y: 1 }, width);

    const open = cellsIn(origin, { kind: 'blast', radius: 3 }, { width, height });
    const occluded = cellsIn(origin, { kind: 'blast', radius: 3 }, { width, height, blocks: blocked });

    expect(occluded.length).toBeLessThan(open.length);
    // (13,1) sits behind the wall along the +x ray → dropped when blocking.
    expect(open).toContainEqual({ x: 13, y: 1 });
    expect(occluded).not.toContainEqual({ x: 13, y: 1 });
  });
});
