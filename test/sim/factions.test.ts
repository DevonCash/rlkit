import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/index';
import { stanceBetween } from '../../src/sim/factions';
import { createEntity, type Entity } from '../../src/core/entity';
import type { Config } from '../../src/config/defaults';
import { defaultConfig } from '../../src/config/defaults';

const config: Config = {
  ...defaultConfig,
  factions: {
    default: 'neutral',
    matrix: {
      player: { monster: 'hostile', critter: 'neutral' },
      monster: { player: 'hostile', monster: 'allied' },
    },
  },
};

function world() {
  return createWorld({ config, rng: 1 });
}
function withFaction(id: string, faction: string, overrides?: Record<string, 'hostile' | 'neutral' | 'allied'>): Entity {
  return createEntity(id, [
    overrides ? { type: 'allegiance', faction, overrides } : { type: 'allegiance', faction },
  ]);
}

describe('stanceBetween (§22.12)', () => {
  it('looks up the configured matrix (and is directional)', () => {
    const w = world();
    const player = withFaction('p', 'player');
    const monster = withFaction('m', 'monster');
    expect(stanceBetween(w, player, monster)).toBe('hostile');
    expect(stanceBetween(w, monster, player)).toBe('hostile');
    expect(stanceBetween(w, monster, withFaction('m2', 'monster'))).toBe('allied');
  });

  it('falls back to the default stance when unspecified', () => {
    const w = world();
    expect(stanceBetween(w, withFaction('a', 'player'), withFaction('b', 'critter'))).toBe('neutral');
    expect(stanceBetween(w, withFaction('a', 'unknown'), withFaction('b', 'player'))).toBe('neutral');
  });

  it('a per-entity override beats the matrix, directionally', () => {
    const w = world();
    // A charmed monster regards the player as allied (override), but the player
    // still regards it per the matrix (hostile).
    const charmed = withFaction('m', 'monster', { p: 'allied' });
    const player = withFaction('p', 'player');
    expect(stanceBetween(w, charmed, player)).toBe('allied'); // override wins
    expect(stanceBetween(w, player, charmed)).toBe('hostile'); // matrix unchanged
  });

  it('defaults when an entity has no allegiance', () => {
    const w = world();
    expect(stanceBetween(w, createEntity('x'), withFaction('m', 'monster'))).toBe('neutral');
  });
});
