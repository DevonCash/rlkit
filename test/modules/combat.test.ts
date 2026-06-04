import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/index';
import { combatModule, lastAttackerOf } from '../../src/modules/combat';
import { perform } from '../../src/sim/action';
import { createEntity, get } from '../../src/core/entity';
import type { Resources } from '../../src/core/component';
import { defaultConfig } from '../../src/config/defaults';

// Zero variance → base damage is deterministic (attack − defense).
const config = { ...defaultConfig, combat: { ...defaultConfig.combat, variance: 0 } };

function arena(mods: ReturnType<typeof combatModule>[], monsterStats: Record<string, number>) {
  const w = createWorld({ config, rng: 1, modules: mods });
  w.state.entities.set('p', createEntity('p', [{ type: 'stats', base: { attack: 5 } }]));
  w.state.entities.set(
    'm',
    createEntity('m', [
      { type: 'stats', base: monsterStats },
      { type: 'resources', pools: { hp: { current: monsterStats['max-hp'] ?? 30 } } },
    ]),
  );
  return w;
}
const hp = (w: ReturnType<typeof arena>) => get<Resources>(w.state.entities.get('m')!, 'resources')!.pools.hp!.current;

describe('combatModule', () => {
  it('applies a critical multiplier and tags the attacker', () => {
    const w = arena([combatModule({ critChance: 1, critMultiplier: 2 })], { defense: 1, 'max-hp': 30 });
    const out = perform(w, { type: 'attack', actor: 'p', target: 'm' });
    expect(out.status).toBe('done');
    expect(hp(w)).toBe(30 - (5 - 1) * 2); // base 4, crit ×2 = 8
    if (out.status === 'done') {
      const dmg = out.events.find((e) => e.type === 'damaged') as { crit?: boolean; by?: string } | undefined;
      expect(dmg?.crit).toBe(true);
      expect(dmg?.by).toBe('p');
    }
    expect(lastAttackerOf(w, 'm')).toBe('p'); // attribution for progression
  });

  it('can miss (no damage, a missed event) when evasion outclasses accuracy', () => {
    const w = arena([combatModule({ evasionFactor: 1, minHit: 0 })], { defense: 1, 'max-hp': 30, evasion: 5 });
    const out = perform(w, { type: 'attack', actor: 'p', target: 'm' });
    expect(out.status).toBe('done');
    expect(hp(w)).toBe(30); // unharmed
    if (out.status === 'done') expect(out.events.some((e) => e.type === 'missed')).toBe(true);
  });

  it('with default options is a behaviour-preserving drop-in (plain damage)', () => {
    const w = arena([combatModule()], { defense: 1, 'max-hp': 30 });
    perform(w, { type: 'attack', actor: 'p', target: 'm' });
    expect(hp(w)).toBe(30 - (5 - 1)); // base damage, no crit
  });
});
