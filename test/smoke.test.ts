import { describe, expect, it } from 'vitest';
import { defaultConfig, version, createWorld, roll } from '../src/index';

// Skeleton smoke test: confirms the test runner, ESM module resolution, and
// the public API surface (§18) wire up end to end. Behavior tests per §22
// live alongside their systems under test/core/.
describe('rlkit public surface', () => {
  it('exposes a version string', () => {
    expect(typeof version).toBe('string');
  });

  it('exposes a default config', () => {
    expect(defaultConfig.energyPerTurn).toBeGreaterThan(0);
  });

  it('createWorld defaults the RNG from a numeric seed (reproducible)', () => {
    const a = createWorld({ config: defaultConfig, rng: 42 });
    const b = createWorld({ config: defaultConfig, rng: 42 });
    expect(a.services.rng.int(0, 9999)).toBe(b.services.rng.int(0, 9999));
    expect(a.state.entities.size).toBe(0);
  });

  it('re-exports content utilities that run off the world RNG', () => {
    const w = createWorld({ config: defaultConfig, rng: 1 });
    const v = roll('1d6', w.services.rng);
    expect(v).toBeGreaterThanOrEqual(1);
    expect(v).toBeLessThanOrEqual(6);
  });
});
