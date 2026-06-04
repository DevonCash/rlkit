import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/index';
import { combatModule } from '../../src/modules/combat';
import { progressionModule, type Experience } from '../../src/modules/progression';
import { perform } from '../../src/sim/action';
import { createEntity, get } from '../../src/core/entity';
import type { Resources, Stats } from '../../src/core/component';
import { defaultConfig } from '../../src/config/defaults';

const config = { ...defaultConfig, combat: { ...defaultConfig.combat, variance: 0 } };

describe('progressionModule', () => {
  it('credits a kill with XP and levels the killer up (stats grow, resources refill)', () => {
    const w = createWorld({
      config,
      rng: 1,
      modules: [
        combatModule(),
        progressionModule({ curve: (lvl) => lvl * 10, gains: () => ({ 'max-hp': 5, attack: 1 }) }),
      ],
    });
    w.state.entities.set(
      'p',
      createEntity('p', [
        { type: 'experience', xp: 0, level: 1 },
        { type: 'stats', base: { attack: 5, 'max-hp': 30 } },
        { type: 'resources', pools: { hp: { current: 20 } } }, // wounded, to see the refill
      ]),
    );
    w.state.entities.set(
      'm',
      createEntity('m', [
        { type: 'stats', base: { bounty: 12, 'max-hp': 1 } },
        { type: 'resources', pools: { hp: { current: 1 } } },
      ]),
    );

    const out = perform(w, { type: 'attack', actor: 'p', target: 'm' });
    expect(out.status).toBe('done');

    const p = w.state.entities.get('p')!;
    const exp = get<Experience>(p, 'experience')!;
    expect(exp.level).toBe(2); // 12 XP crosses the level-1→2 curve (10)
    expect(exp.xp).toBe(2); // remainder
    expect(get<Stats>(p, 'stats')!.base.attack).toBe(6); // +1 gain
    expect(get<Stats>(p, 'stats')!.base['max-hp']).toBe(35); // +5 gain
    expect(get<Resources>(p, 'resources')!.pools.hp!.current).toBe(35); // refilled to new max
  });

  it('requires the combat module (declared dependency)', () => {
    expect(() =>
      createWorld({ config, rng: 1, modules: [progressionModule({ curve: () => 10, gains: () => ({}) })] }),
    ).toThrow(/requires missing module "combat"/);
  });
});
