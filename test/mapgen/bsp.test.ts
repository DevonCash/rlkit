import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { generateBsp } from '../../src/mapgen/bsp';
import { decorate, entranceOf } from '../../src/mapgen/decorate';
import { reachableFrom, walkableCells } from '../../src/mapgen/reachability';
import { makeRng } from '../../src/adapters/rng';
import { mapPalette, isWalkableIndexOf } from './helpers';
import type { Region } from '../../src/mapgen/generator';

const p = mapPalette();
const FLOOR = p.index('floor');
const STAIRS = p.index('stairs_down');
const isWalkable = isWalkableIndexOf(p);

function gen(seed: number, width = 48, height = 32) {
  const rng = makeRng(seed);
  const map = generateBsp({ width, height, floorIndex: FLOOR }, rng);
  return decorate(map, { floorIndex: FLOOR, stairsIndex: STAIRS, isWalkableIndex: isWalkable });
}

function overlaps(a: Region, b: Region): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe('bsp generator (§22.10)', () => {
  test.prop([fc.integer({ min: 1, max: 100000 })])(
    'every seed yields a fully reachable level with all spawn hints reachable',
    (seed) => {
      const map = gen(seed);
      const reachable = reachableFrom(map.tiles, map.width, map.height, entranceOf(map), isWalkable);
      // Full connectivity: every walkable cell is reachable from the entrance.
      expect(reachable.size).toBe(walkableCells(map.tiles, isWalkable).size);
      // Every spawn hint sits on a reachable cell.
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
        expect(v).toBeLessThan(p.size); // a valid palette index
      }
    },
  );

  test.prop([fc.integer({ min: 1, max: 100000 })])('same seed → identical map', (seed) => {
    const a = gen(seed);
    const b = gen(seed);
    expect([...a.tiles]).toEqual([...b.tiles]);
    expect(a.regions).toEqual(b.regions);
    expect(a.connections).toEqual(b.connections);
    expect(a.spawnHints).toEqual(b.spawnHints);
  });

  it('rooms do not overlap and the connection graph is one component', () => {
    const map = gen(42);
    const rooms = map.regions ?? [];
    expect(rooms.length).toBeGreaterThan(1);
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        expect(overlaps(rooms[i]!, rooms[j]!)).toBe(false);
      }
    }
    // The room graph (from connections) is a single connected component.
    const adj = new Map<number, number[]>();
    const link = (from: number, to: number) => {
      let arr = adj.get(from);
      if (!arr) {
        arr = [];
        adj.set(from, arr);
      }
      arr.push(to);
    };
    for (const { a, b } of map.connections ?? []) {
      link(a, b);
      link(b, a);
    }
    const seen = new Set<number>([0]);
    const stack = [0];
    while (stack.length) {
      const n = stack.pop()!;
      for (const m of adj.get(n) ?? []) {
        if (!seen.has(m)) {
          seen.add(m);
          stack.push(m);
        }
      }
    }
    expect(seen.size).toBe(rooms.length);
  });

  it('places a stairs_down tile reachable from the entrance', () => {
    const map = gen(7);
    const stairs = map.spawnHints?.find((h) => h.kind === 'stairs_down');
    expect(stairs).toBeDefined();
    expect(map.tiles[stairs!.cell]).toBe(STAIRS);
  });
});

describe('decorate connects stranded regions (mutate-to-connect)', () => {
  it('links a disconnected pocket to the entrance', () => {
    const width = 9;
    const height = 5;
    const tiles = new Uint16Array(width * height).fill(0);
    // Two separate floor rooms with a wall gap between them.
    const carve = (x0: number, x1: number, y0: number, y1: number) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles[y * width + x] = FLOOR;
    };
    carve(1, 2, 1, 3); // left pocket
    carve(6, 7, 1, 3); // right pocket (stranded)
    const map = {
      width,
      height,
      tiles,
      spawnHints: [{ kind: 'entrance', cell: 1 * width + 1 }],
    };
    const out = decorate(map, { floorIndex: FLOOR, stairsIndex: STAIRS, isWalkableIndex: isWalkable });
    const reachable = reachableFrom(out.tiles, width, height, entranceOf(out), isWalkable);
    expect(reachable.size).toBe(walkableCells(out.tiles, isWalkable).size);
  });
});
