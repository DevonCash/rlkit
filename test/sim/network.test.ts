/**
 * Cell-network connectivity (§6, R3): flag-backed membership, min-cell reps,
 * bridging/cutting, save/load stability, the layer escape hatch, and coexistence.
 */
import { describe, it, expect } from 'vitest';
import { createNetworkManager } from '../../src/sim/network';
import { encodeSave, loadWorld } from '../../src/index';
import { defaultConfig } from '../../src/config/defaults';
import { makeWorld, makeLevel } from './helpers';
import { createEntity } from '../../src/core/entity';
import type { TileFlags } from '../../src/core/component';
import { setTileEffect } from '../../src/core/tile-effect';
import type { World } from '../../src/core/world';
import { levelCell, ensureU8Layer } from '../../src/core/level';

/**
 * Register the game's `wire` flag + tile (in order: flag before tile). A game
 * re-runs this on load, like re-registering tiles via a module — the save stores
 * tile *indices*, so the palette must be rebuilt identically.
 */
function registerWire(w: World) {
  w.services.flags.register('wire');
  w.services.tiles.register({ id: 'wire', walkable: true, transparent: true, glyph: '=', fg: '#fc0', flags: ['wire'] });
}

/** A 5×1 corridor with a `wire` flag and a wire tile. */
function wireWorld(seed = 1) {
  const w = makeWorld(seed);
  registerWire(w);
  const lvl = makeLevel('L', 5, 1);
  w.state.levels.set('L', lvl);
  return { w, lvl };
}

const cell = (lvl: ReturnType<typeof makeLevel>, x: number) => levelCell(lvl, x, 0);

describe('network index (§6, R3)', () => {
  it('two disjoint wire blobs are distinct networks; bridging merges them', () => {
    const { w, lvl } = wireWorld();
    const lay = (x: number, id: string) => {
      for (const e of setTileEffect('L', cell(lvl, x), id).apply(w)) w.services.bus.emit(e);
    };
    // Wires at 0,1 (blob A) and 3,4 (blob B); 2 is plain floor (gap).
    lay(0, 'wire'); lay(1, 'wire'); lay(3, 'wire'); lay(4, 'wire');

    const net = createNetworkManager(w).forLevel('L');
    net.ensure({ id: 'wires', flag: 'wire' });

    expect(net.networkOf('wires', cell(lvl, 0))).toBe(cell(lvl, 0)); // rep = min cell
    expect(net.sameNetwork('wires', cell(lvl, 0), cell(lvl, 1))).toBe(true);
    expect(net.sameNetwork('wires', cell(lvl, 0), cell(lvl, 3))).toBe(false); // separate blobs
    expect(net.networkOf('wires', cell(lvl, 2))).toBe(-1); // not a member

    // Bridge cell 2 → one network; a consumer at 4 now shares 0's network.
    lay(2, 'wire');
    expect(net.sameNetwork('wires', cell(lvl, 0), cell(lvl, 4))).toBe(true);
    expect(net.networkOf('wires', cell(lvl, 4))).toBe(cell(lvl, 0));

    // Cut the bridge → two networks again; 4 no longer connected to 0.
    lay(2, 'floor');
    expect(net.sameNetwork('wires', cell(lvl, 0), cell(lvl, 4))).toBe(false);
  });

  it('entity-contributed wire membership composes with tile membership', () => {
    const { w, lvl } = wireWorld();
    for (const e of setTileEffect('L', cell(lvl, 0), 'wire').apply(w)) w.services.bus.emit(e);
    // An entity at cell 1 contributing `wire` bridges to the wire tile at 0.
    const dev = createEntity('dev', [{ type: 'position', x: 1, y: 0, levelId: 'L' }, { type: 'tileFlags', flags: ['wire'] } as TileFlags]);
    w.state.entities.set('dev', dev);
    w.services.queries.index(dev);
    w.services.queries.place('dev', 'L', cell(lvl, 1));

    const net = createNetworkManager(w).forLevel('L');
    net.ensure({ id: 'wires', flag: 'wire' });
    expect(net.sameNetwork('wires', cell(lvl, 0), cell(lvl, 1))).toBe(true);
  });

  it('save/load preserves answers with nothing network-specific serialized', () => {
    const { w, lvl } = wireWorld();
    for (const x of [0, 1, 2]) for (const e of setTileEffect('L', cell(lvl, x), 'wire').apply(w)) w.services.bus.emit(e);

    const before = createNetworkManager(w).forLevel('L');
    before.ensure({ id: 'wires', flag: 'wire' });
    const repBefore = before.networkOf('wires', cell(lvl, 2));

    const loaded = loadWorld(encodeSave(w), { config: defaultConfig });
    registerWire(loaded); // game re-registers its flags + tiles on load (rebuilds the palette)
    const after = createNetworkManager(loaded).forLevel('L');
    after.ensure({ id: 'wires', flag: 'wire' });
    expect(after.networkOf('wires', cell(lvl, 2))).toBe(repBefore);
    expect(after.sameNetwork('wires', cell(lvl, 0), cell(lvl, 2))).toBe(true);
  });

  it('the raw-layer escape hatch works and coexists with a flag-backed index', () => {
    const { w, lvl } = wireWorld();
    // A separate `pipe` membership maintained as a raw Uint8 layer.
    const pipes = ensureU8Layer(lvl, 'pipe');
    pipes[cell(lvl, 2)] = 1;
    pipes[cell(lvl, 3)] = 1;

    const net = createNetworkManager(w).forLevel('L');
    net.ensure({ id: 'pipes', layer: 'pipe' });
    expect(net.sameNetwork('pipes', cell(lvl, 2), cell(lvl, 3))).toBe(true);
    expect(net.networkOf('pipes', cell(lvl, 0))).toBe(-1);
  });
});
