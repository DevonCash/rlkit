import { describe, expect, it } from 'vitest';
import { defaultConfig, version } from '../src/index';

// Skeleton smoke test: confirms the test runner, ESM module resolution, and
// the public API surface (§18) wire up end to end. Behavior tests per §22
// arrive with their milestones (§20).
describe('rlkit skeleton', () => {
  it('exposes a version string', () => {
    expect(typeof version).toBe('string');
  });

  it('exposes a default config', () => {
    expect(defaultConfig.energyPerTurn).toBeGreaterThan(0);
  });
});
