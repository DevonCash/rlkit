import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { parsePrefab, stampPrefab, generatePrefab } from '../../src/mapgen/prefab';
import { decorate, entranceOf } from '../../src/mapgen/decorate';
import { reachableFrom, walkableCells } from '../../src/mapgen/reachability';
import { makeRng } from '../../src/adapters/rng';
import { mapPalette, isWalkableIndexOf } from './helpers';
import type { Region } from '../../src/mapgen/generator';

const p = mapPalette();
const WALL = p.index('wall');
const FLOOR = p.index('floor');
const STAIRS = p.index('stairs_down');
const isWalkable = isWalkableIndexOf(p);

function gen(seed: number, width = 48, height = 32) {
  const map = generatePrefab({ width, height, floorIndex: FLOOR }, makeRng(seed));
  return decorate(map, { floorIndex: FLOOR, stairsIndex: STAIRS, isWalkableIndex: isWalkable });
}

function overlaps(a: Region, b: Region): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe('parsePrefab', () => {
  it('records anchors in row-major order and normalizes ragged rows', () => {
    const pf = parsePrefab(['#####', '+...+', '##']); // last row ragged → padded to width 5
    expect(pf.width).toBe(5);
    expect(pf.height).toBe(3);
    expect(pf.rows[2]).toBe('#####'); // padded with wall chars
    // anchors at local (0,1) and (4,1): cells 1*5+0=5 and 1*5+4=9, row-major.
    expect(pf.anchors).toEqual([5, 9]);
  });

  it('throws on empty input', () => {
    expect(() => parsePrefab([])).toThrow();
  });
});

describe('stampPrefab respects anchors (§22.10b)', () => {
  it('writes the template at the origin and maps anchors to absolute cells', () => {
    const mapWidth = 20;
    const mapHeight = 12;
    const tiles = new Uint16Array(mapWidth * mapHeight).fill(WALL);
    const pf = parsePrefab(['#####', '#...#', '+...+', '#####']); // anchors local (0,2),(4,2)
    const ox = 6;
    const oy = 3;

    const anchors = stampPrefab(tiles, mapWidth, pf, ox, oy, { floorIndex: FLOOR, wallIndex: WALL });

    // A wall char maps to wall, a floor char maps to floor, at exactly (ox+lx, oy+ly).
    expect(tiles[(oy + 0) * mapWidth + (ox + 0)]).toBe(WALL); // '#'
    expect(tiles[(oy + 1) * mapWidth + (ox + 1)]).toBe(FLOOR); // '.'
    expect(tiles[(oy + 2) * mapWidth + (ox + 0)]).toBe(FLOOR); // '+' is floor

    // Anchors come back as absolute cells at the authored offsets, in order.
    expect(anchors).toEqual([
      (oy + 2) * mapWidth + (ox + 0),
      (oy + 2) * mapWidth + (ox + 4),
    ]);
  });

  it('throws when the stamp falls outside the grid', () => {
    const tiles = new Uint16Array(10 * 10).fill(WALL);
    const pf = parsePrefab(['###', '#.#', '###']);
    expect(() => stampPrefab(tiles, 10, pf, 9, 9, { floorIndex: FLOOR, wallIndex: WALL })).toThrow();
  });
});

describe('prefab generator (§22.10)', () => {
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
    expect(a.regions).toEqual(b.regions);
    expect(a.spawnHints).toEqual(b.spawnHints);
  });

  it('places non-overlapping prefab rooms', () => {
    const map = generatePrefab({ width: 48, height: 32, floorIndex: FLOOR }, makeRng(42));
    const rooms = map.regions ?? [];
    expect(rooms.length).toBeGreaterThan(0);
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        expect(overlaps(rooms[i]!, rooms[j]!)).toBe(false);
      }
    }
  });
});
