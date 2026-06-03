import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { generateDrunkard } from '../../src/mapgen/drunkard';
import { decorate, entranceOf } from '../../src/mapgen/decorate';
import { reachableFrom, walkableCells } from '../../src/mapgen/reachability';
import { makeRng } from '../../src/adapters/rng';
import { mapPalette, isWalkableIndexOf } from './helpers';

const p = mapPalette();
const FLOOR = p.index('floor');
const STAIRS = p.index('stairs_down');
const isWalkable = isWalkableIndexOf(p);

function raw(seed: number, width = 48, height = 32) {
  return generateDrunkard({ width, height, floorIndex: FLOOR }, makeRng(seed));
}
function gen(seed: number, width = 48, height = 32) {
  return decorate(raw(seed, width, height), {
    floorIndex: FLOOR,
    stairsIndex: STAIRS,
    isWalkableIndex: isWalkable,
  });
}

describe('drunkard generator (§22.10)', () => {
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

  test.prop([fc.integer({ min: 1, max: 100000 })])(
    'is connected by construction (reachable WITHOUT decorate)',
    (seed) => {
      const map = raw(seed);
      const reachable = reachableFrom(map.tiles, map.width, map.height, entranceOf(map), isWalkable);
      // The raw walk is already fully 4-connected — no connector corridors needed.
      expect(reachable.size).toBe(walkableCells(map.tiles, isWalkable).size);
    },
  );

  it('carves roughly the configured coverage of the interior', () => {
    const width = 48;
    const height = 32;
    const coverage = 0.4;
    const map = generateDrunkard({ width, height, floorIndex: FLOOR, coverage }, makeRng(123));
    const interior = (width - 2) * (height - 2);
    const carved = walkableCells(map.tiles, isWalkable).size;
    // Tolerant lower bound: the walk should approach the target, not starve.
    expect(carved).toBeGreaterThanOrEqual(Math.floor(coverage * interior * 0.8));
  });
});
