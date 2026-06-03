import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { generateCellular } from '../../src/mapgen/cellular';
import { decorate, entranceOf } from '../../src/mapgen/decorate';
import { reachableFrom, walkableCells } from '../../src/mapgen/reachability';
import { makeRng } from '../../src/adapters/rng';
import { mapPalette, isWalkableIndexOf } from './helpers';

const p = mapPalette();
const FLOOR = p.index('floor');
const STAIRS = p.index('stairs_down');
const isWalkable = isWalkableIndexOf(p);

function gen(seed: number, width = 48, height = 32) {
  const rng = makeRng(seed);
  const map = generateCellular({ width, height, floorIndex: FLOOR }, rng);
  return decorate(map, { floorIndex: FLOOR, stairsIndex: STAIRS, isWalkableIndex: isWalkable });
}

describe('cellular generator (§22.10)', () => {
  test.prop([fc.integer({ min: 1, max: 100000 })])(
    'every seed yields a fully reachable level with all spawn hints reachable',
    (seed) => {
      const map = gen(seed);
      const reachable = reachableFrom(map.tiles, map.width, map.height, entranceOf(map), isWalkable);
      expect(reachable.size).toBe(walkableCells(map.tiles, isWalkable).size);
      for (const h of map.spawnHints ?? []) expect(reachable.has(h.cell)).toBe(true);
    },
  );

  test.prop([fc.integer({ min: 1, max: 100000 })])(
    'emits only registered tile indices and stays within bounds',
    (seed) => {
      const map = gen(seed);
      expect(map.tiles.length).toBe(map.width * map.height);
      for (const v of map.tiles) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(p.size);
      }
    },
  );

  test.prop([fc.integer({ min: 1, max: 100000 })])('same seed → identical map', (seed) => {
    const a = gen(seed);
    const b = gen(seed);
    expect([...a.tiles]).toEqual([...b.tiles]);
    expect(a.spawnHints).toEqual(b.spawnHints);
  });

  it('keeps the border solid (no walkable cell on the edge)', () => {
    const map = gen(99);
    const { width, height, tiles } = map;
    for (let x = 0; x < width; x++) {
      expect(isWalkable(tiles[x]!)).toBe(false); // top row
      expect(isWalkable(tiles[(height - 1) * width + x]!)).toBe(false); // bottom row
    }
    for (let y = 0; y < height; y++) {
      expect(isWalkable(tiles[y * width]!)).toBe(false); // left col
      expect(isWalkable(tiles[y * width + width - 1]!)).toBe(false); // right col
    }
  });

  it('a near-solid fill still yields a reachable level via the center fallback', () => {
    // High wallProb + high threshold tends to fill solid; the generator forces
    // a center floor so there is always ≥1 walkable cell for decorate.
    const raw = generateCellular(
      { width: 24, height: 16, floorIndex: FLOOR, wallProb: 0.95, iterations: 6, threshold: 8 },
      makeRng(3),
    );
    expect(walkableCells(raw.tiles, isWalkable).size).toBeGreaterThanOrEqual(1);
    const map = decorate(raw, { floorIndex: FLOOR, stairsIndex: STAIRS, isWalkableIndex: isWalkable });
    const reachable = reachableFrom(map.tiles, map.width, map.height, entranceOf(map), isWalkable);
    expect(reachable.size).toBe(walkableCells(map.tiles, isWalkable).size);
  });
});
