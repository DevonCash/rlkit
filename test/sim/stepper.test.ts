/**
 * Per-world-tick steppers (§7.1, R1): cadence firing, deterministic ordering,
 * and save/load continuation (re-registered on load like other services).
 */
import { describe, it, expect } from 'vitest';
import { makeWorld, makeLevel } from './helpers';
import { registerStepper } from '../../src/sim/stepper';
import { tickRealtime } from '../../src/sim/driver';
import { encodeSave, loadWorld } from '../../src/index';
import { defaultConfig } from '../../src/config/defaults';
import { ensureFloatLayer } from '../../src/core/level';

/** A world with one waiting player actor and a level 'L'. */
function worldWithActor(seed = 1) {
  const world = makeWorld(seed);
  world.state.levels.set('L', makeLevel('L', 4, 1));
  world.services.timeline.addActor('p', 100);
  return world;
}

/** Initialize a stepper's layer on level L (the game opts the level into stepping). */
function initLayer(world: ReturnType<typeof worldWithActor>, name: string) {
  ensureFloatLayer(world.state.levels.get('L')!, name);
}

const counterStepper = (id: string, cadence: number) => ({
  id,
  layer: id,
  cadence,
  step: (_w: unknown, level: { layers: Map<string, unknown> }, data: Float32Array) => {
    void level;
    data[0]! += 1;
    return [];
  },
});

describe('registerStepper (§7.1)', () => {
  it('fires on its cadence as the world clock advances', () => {
    const world = worldWithActor();
    initLayer(world, 'count');
    registerStepper(world, counterStepper('count', 5));
    tickRealtime(world, { player: 'p', ticks: 20 }); // fires at clock 5,10,15,20
    expect(ensureFloatLayer(world.state.levels.get('L')!, 'count')[0]).toBe(4);
  });

  it('skips levels that do not carry the layer (no force-create)', () => {
    const world = worldWithActor(); // 'count' layer NOT initialized
    registerStepper(world, counterStepper('count', 5));
    tickRealtime(world, { player: 'p', ticks: 20 });
    expect(world.state.levels.get('L')!.layers.has('count')).toBe(false);
  });

  it('rejects a non-positive cadence', () => {
    const world = worldWithActor();
    expect(() => registerStepper(world, counterStepper('bad', 0))).toThrow(/cadence/);
  });

  it('runs two same-cadence steppers each tick (deterministic, both fire)', () => {
    const world = worldWithActor();
    initLayer(world, 'a');
    initLayer(world, 'b');
    registerStepper(world, counterStepper('a', 5));
    registerStepper(world, counterStepper('b', 5));
    tickRealtime(world, { player: 'p', ticks: 15 }); // 3 cadence boundaries
    const lvl = world.state.levels.get('L')!;
    expect(ensureFloatLayer(lvl, 'a')[0]).toBe(3);
    expect(ensureFloatLayer(lvl, 'b')[0]).toBe(3);
  });

  it('survives save/load when re-registered, continuing the chain identically', () => {
    const world = worldWithActor();
    initLayer(world, 'count'); // persists (non-transient) across save/load
    registerStepper(world, counterStepper('count', 5));
    tickRealtime(world, { player: 'p', ticks: 10 }); // 2 fires
    expect(ensureFloatLayer(world.state.levels.get('L')!, 'count')[0]).toBe(2);

    // Save, reload, re-register (the documented contract), continue.
    const loaded = loadWorld(encodeSave(world), { config: defaultConfig });
    registerStepper(loaded, counterStepper('count', 5)); // idempotent: no double-schedule
    tickRealtime(loaded, { player: 'p', ticks: 10 }); // 2 more fires

    // The 'count' layer persisted (non-transient) and the timer resumed.
    expect(ensureFloatLayer(loaded.state.levels.get('L')!, 'count')[0]).toBe(4);
  });
});
