import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import { defaultConfig } from '../../src/config/defaults';
import { makeRng } from '../../src/adapters/rng';

describe('createWorld', () => {
  it('wires services over empty state', () => {
    const w = createWorld({ config: defaultConfig, rng: makeRng(123) });
    expect(w.state.entities.size).toBe(0);
    expect(w.state.levels.size).toBe(0);
    expect(w.state.turn).toBe(0);
    expect(w.state.timeline.clock).toBe(0);
    expect(w.services.bus).toBeDefined();
    expect(w.services.queries).toBeDefined();
    expect(w.services.config).toBe(defaultConfig);
  });

  it('provides the engine-default registries', () => {
    const w = createWorld({ config: defaultConfig, rng: makeRng(0) });
    for (const kind of ['components', 'mixins', 'blueprints', 'tiles']) {
      expect(w.services.registries[kind]).toBeDefined();
    }
  });

  it('seeds a deterministic RNG and snapshots its state', () => {
    const a = createWorld({ config: defaultConfig, rng: makeRng(7) });
    const b = createWorld({ config: defaultConfig, rng: makeRng(7) });
    expect(a.services.rng.int(0, 1000)).toBe(b.services.rng.int(0, 1000));
    expect(a.state.rng).toBeDefined();
  });

  it('accepts extra registries', () => {
    const w = createWorld({
      config: defaultConfig,
      rng: makeRng(0),
      registries: { statuses: { register() {}, get: () => 0, tryGet: () => undefined, has: () => false, ids: () => [] } },
    });
    expect(w.services.registries.statuses).toBeDefined();
  });
});
