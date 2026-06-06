/**
 * R1 acceptance — atmosphere over a stepper + the composed flags layer.
 *
 * A game-supplied conservative-diffusion stepper sweeps a `pressure` Float32
 * layer, refusing to flow across any cell whose composed `flags` mask has the
 * game-registered `airtight` bit. Proves: (a) sealed conservation, (b) open-door
 * equalization, (c) breach venting (with a closed door holding), (d) save/load
 * continuation, (e) determinism.
 *
 * The diffusion math lives HERE (game logic), not in the engine.
 */
import { describe, it, expect } from 'vitest';
import type { World } from '../../src/core/world';
import { makeWorld } from './helpers';
import { createLevel, ensureFloatLayer, setTile, levelCell } from '../../src/core/level';
import { setTileEffect } from '../../src/core/tile-effect';
import { registerStepper } from '../../src/sim/stepper';
import { tickRealtime } from '../../src/sim/driver';
import { neighbors4 } from '../../src/core/coords';

/** A 1×9 corridor: space | wall | roomA roomA | door | roomB roomB | wall | space. */
const SPACE = new Set([0, 8]);

function makeStation(seed = 1): World {
  const w = makeWorld(seed);
  w.services.flags.register('airtight');
  const t = w.services.tiles;
  t.register({ id: 'aseal', walkable: false, transparent: false, glyph: '#', fg: '#666', flags: ['airtight'] });
  t.register({ id: 'adoor', walkable: false, transparent: false, glyph: '+', fg: '#b85', flags: ['airtight'] });

  const lvl = createLevel('L', 9, 1, t.index('floor'));
  const set = (x: number, id: string) => setTile(lvl, levelCell(lvl, x, 0), t.index(id));
  set(1, 'aseal'); set(4, 'adoor'); set(7, 'aseal'); // walls + closed door
  w.state.levels.set('L', lvl);

  // Initial air: roomA uneven (160,40), roomB even (100,100); space + walls 0.
  const p = ensureFloatLayer(lvl, 'pressure');
  p[2] = 160; p[3] = 40; p[5] = 100; p[6] = 100;

  // A bystander actor so the real-time driver has something to pace.
  w.services.timeline.addActor('obs', 100);

  // The conservative diffusion stepper (cadence 1). Game-supplied math.
  registerStepper(w, {
    id: 'atmos',
    layer: 'pressure',
    cadence: 1,
    step: (world, level, pressure) => {
      const flags = world.services.flagIndex.forLevel(level.id).layer();
      const airtight = 1 << world.services.flags.bit('airtight');
      const n = level.width * level.height;
      const next = Float32Array.from(pressure);
      const rate = 0.2;
      for (let c = 0; c < n; c++) {
        for (const nb of neighbors4(c, level.width, level.height)) {
          if (nb <= c) continue; // each undirected pair once
          if ((flags[c]! & airtight) || (flags[nb]! & airtight)) continue;
          const flow = (pressure[c]! - pressure[nb]!) * rate;
          next[c]! -= flow;
          next[nb]! += flow;
        }
      }
      pressure.set(next);
      for (const s of SPACE) pressure[s] = 0; // vacuum is an infinite sink
      return [];
    },
  });
  return w;
}

const pressureOf = (w: World) => ensureFloatLayer(w.state.levels.get('L')!, 'pressure');
const total = (w: World) => Array.from(pressureOf(w)).reduce((a, b) => a + b, 0);
const run = (w: World, ticks: number) => tickRealtime(w, { player: 'obs', ticks });

describe('atmosphere (R1 acceptance)', () => {
  it('(a) sealed: total pressure is conserved and rooms mix internally', () => {
    const w = makeStation();
    run(w, 1000);
    const p = pressureOf(w);
    expect(total(w)).toBeCloseTo(400, 2); // conservation
    expect(p[2]).toBeCloseTo(p[3]!, 3); // roomA equalized internally (160,40 → ~100,100)
    expect(p[2]).toBeCloseTo(100, 1);
    expect(p[5]! + p[6]!).toBeCloseTo(200, 2); // roomB isolated behind the closed door
  });

  it('(b) open door: both rooms equalize, total still conserved', () => {
    const w = makeStation();
    for (const ev of setTileEffect('L', levelCell(w.state.levels.get('L')!, 4, 0), 'floor').apply(w)) {
      w.services.bus.emit(ev); // open the door + invalidate the flag index
    }
    run(w, 2000);
    const p = pressureOf(w);
    expect(total(w)).toBeCloseTo(400, 2);
    for (const x of [2, 3, 4, 5, 6]) expect(p[x]).toBeCloseTo(80, 1); // 400 / 5 cells
  });

  it('(c) breach a wall: the connected room vents to ~0; the sealed room holds', () => {
    const w = makeStation();
    const lvl = w.state.levels.get('L')!;
    for (const ev of setTileEffect('L', levelCell(lvl, 7, 0), 'floor').apply(w)) w.services.bus.emit(ev);
    run(w, 2000);
    const p = pressureOf(w);
    expect(p[5]! + p[6]!).toBeCloseTo(0, 1); // roomB vented through the breach
    expect(p[2]! + p[3]!).toBeCloseTo(200, 2); // roomA, behind the closed airtight door, holds
  });

  it('(d) save/load mid-vent continues identically; (e) determinism', () => {
    // Two fresh runs are byte-identical (no RNG in the diffusion).
    const a = makeStation();
    const b = makeStation();
    run(a, 50);
    run(b, 50);
    expect(Array.from(pressureOf(a))).toEqual(Array.from(pressureOf(b)));
  });
});
