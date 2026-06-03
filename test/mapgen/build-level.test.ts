import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { createWorld } from '../../src/index';
import { buildLevel } from '../../src/mapgen/build-level';
import { isWalkable, tilesLayer } from '../../src/core/level';
import { reachableFrom, walkableCells } from '../../src/mapgen/reachability';
import { defaultConfig } from '../../src/config/defaults';

function world(seed: number) {
  return createWorld({ config: defaultConfig, rng: seed });
}

describe('buildLevel', () => {
  it('generates, decorates, and registers a reachable level', () => {
    const w = world(1);
    const { level, entrance, stairs } = buildLevel(w, { generator: 'bsp', width: 40, height: 24 });
    expect(w.state.levels.get(level.id)).toBe(level);
    const isWalk = (i: number) => w.services.tiles.byIndex(i).walkable;
    const tiles = tilesLayer(level);
    const reachable = reachableFrom(tiles, level.width, level.height, entrance, isWalk);
    expect(reachable.size).toBe(walkableCells(tiles, isWalk).size);
    expect(reachable.has(stairs)).toBe(true);
    expect(isWalkable(level, entrance, w.services.tiles)).toBe(true);
  });

  test.prop([fc.integer({ min: 1, max: 100000 })])(
    'same world seed → identical level (RNG forked, reproducible)',
    (seed) => {
      const a = buildLevel(world(seed), { generator: 'bsp', width: 32, height: 20 });
      const b = buildLevel(world(seed), { generator: 'bsp', width: 32, height: 20 });
      expect([...tilesLayer(a.level)]).toEqual([...tilesLayer(b.level)]);
      expect(a.entrance).toBe(b.entrance);
      expect(a.stairs).toBe(b.stairs);
    },
  );

  it('assigns sequential default ids for multiple levels', () => {
    const w = world(5);
    const a = buildLevel(w, { generator: 'bsp', width: 24, height: 16 });
    const b = buildLevel(w, { generator: 'bsp', width: 24, height: 16 });
    expect(a.level.id).toBe('level-0');
    expect(b.level.id).toBe('level-1');
    expect(w.state.levels.size).toBe(2);
  });

  it('throws on an unknown generator', () => {
    const w = world(1);
    expect(() => buildLevel(w, { generator: 'nope', width: 10, height: 10 })).toThrow();
  });
});

// Every registered generator, driven through buildLevel, yields a reachable
// level with reachable stairs and is reproducible from the world seed.
const GENERATORS = ['bsp', 'cellular'];

describe.each(GENERATORS)('buildLevel(%s)', (generator) => {
  it('produces a registered, fully-reachable level with reachable stairs', () => {
    const w = world(7);
    const { level, entrance, stairs } = buildLevel(w, { generator, width: 40, height: 24 });
    expect(w.state.levels.get(level.id)).toBe(level);
    const isWalk = (i: number) => w.services.tiles.byIndex(i).walkable;
    const tiles = tilesLayer(level);
    const reachable = reachableFrom(tiles, level.width, level.height, entrance, isWalk);
    expect(reachable.size).toBe(walkableCells(tiles, isWalk).size);
    expect(reachable.has(stairs)).toBe(true);
    expect(isWalkable(level, entrance, w.services.tiles)).toBe(true);
  });

  test.prop([fc.integer({ min: 1, max: 100000 })])('same world seed → identical level', (seed) => {
    const a = buildLevel(world(seed), { generator, width: 32, height: 20 });
    const b = buildLevel(world(seed), { generator, width: 32, height: 20 });
    expect([...tilesLayer(a.level)]).toEqual([...tilesLayer(b.level)]);
    expect(a.entrance).toBe(b.entrance);
    expect(a.stairs).toBe(b.stairs);
  });
});
