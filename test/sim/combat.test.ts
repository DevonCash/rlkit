import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { createWorld, perform } from '../../src/index';
import { createEntity, get, type Entity } from '../../src/core/entity';
import type { Resources } from '../../src/core/component';
import type { Registry } from '../../src/core/registry';
import type { StatDef } from '../../src/sim/stats';
import type { ResourceDef } from '../../src/sim/resources';
import type { Mixin } from '../../src/core/mixin';
import type { Effect } from '../../src/core/action';
import { defaultConfig } from '../../src/config/defaults';

type W = ReturnType<typeof createWorld>;
function world(seed = 1): W {
  const w = createWorld({ config: defaultConfig, rng: seed });
  (w.services.registries.stats as Registry<StatDef>).register('max-hp', { id: 'max-hp', default: 20 });
  (w.services.registries.stats as Registry<StatDef>).register('attack', { id: 'attack', default: 0 });
  (w.services.registries.stats as Registry<StatDef>).register('defense', { id: 'defense', default: 0 });
  (w.services.registries.resources as Registry<ResourceDef>).register('hp', {
    id: 'hp',
    max: 'max-hp',
    thresholds: [{ at: 0, emit: 'died' }],
  });
  return w;
}
function fighter(w: W, id: string, attack: number, defense: number, hp: number, maxHp = 20): Entity {
  const e = createEntity(id, [
    { type: 'stats', base: { attack, defense, 'max-hp': maxHp } },
    { type: 'resources', pools: { hp: { current: hp } } },
  ]);
  w.state.entities.set(id, e);
  return e;
}
const hpOf = (e: Entity) => get<Resources>(e, 'resources')!.pools.hp!.current;

describe('combat (§22.8)', () => {
  test.prop([fc.integer(), fc.integer({ min: 0, max: 30 }), fc.integer({ min: 0, max: 30 })])(
    'hp never goes negative; damage stays within formula bounds',
    (seed, attack, defense) => {
      const w = world(seed);
      fighter(w, 'a', attack, 0, 20);
      const d = fighter(w, 'b', 0, defense, 20);
      perform(w, { type: 'attack', actor: 'a', target: 'b' });
      const dealt = 20 - hpOf(d);
      const { minDamage, variance } = defaultConfig.combat;
      expect(hpOf(d)).toBeGreaterThanOrEqual(0);
      expect(dealt).toBeGreaterThanOrEqual(Math.min(20, minDamage));
      expect(dealt).toBeLessThanOrEqual(Math.max(minDamage, attack - defense + variance));
    },
  );

  it('higher defense reduces damage', () => {
    const seed = 99;
    const lo = world(seed);
    fighter(lo, 'a', 10, 0, 20);
    const soft = fighter(lo, 'b', 0, 0, 20);
    perform(lo, { type: 'attack', actor: 'a', target: 'b' });

    const hi = world(seed);
    fighter(hi, 'a', 10, 0, 20);
    const armored = fighter(hi, 'b', 0, 5, 20);
    perform(hi, { type: 'attack', actor: 'a', target: 'b' });

    expect(20 - hpOf(armored)).toBeLessThan(20 - hpOf(soft));
  });

  it('reaching 0 HP fires died and overkill emits resource:underflow; the dead leave the timeline', () => {
    const w = world(1);
    fighter(w, 'a', 100, 0, 20);
    fighter(w, 'b', 0, 0, 3);
    w.services.timeline.addActor('b', 10);

    const events: string[] = [];
    w.services.bus.on('died', () => events.push('died'));
    w.services.bus.on('resource:underflow', () => events.push('underflow'));

    perform(w, { type: 'attack', actor: 'a', target: 'b' });
    expect(events).toContain('died');
    expect(events).toContain('underflow');
    // the death reactor removed b from the timeline
    w.services.timeline.addActor('a', 10);
    expect(w.services.timeline.next()).toEqual({ kind: 'actor', id: 'a' });
  });
});

describe('bump → attack via redirect runs target reactors (§22.6/§22.8)', () => {
  it('an armor pre-reactor reduces the pending damage effect dealt through a bump', () => {
    const w = world(1);
    let armorFired = 0;
    // Defender's armor mixin softens any pending hp-damage by 4 (pre-phase).
    (w.services.registries.mixins as Registry<Mixin>).register('armored', {
      name: 'armored',
      requires: [],
      onAction(ctx) {
        for (const eff of ctx.effects) {
          if (eff.kind === 'resource:hp') {
            armorFired++;
            const dmg = eff as Effect & { delta: number };
            dmg.delta = Math.min(0, dmg.delta + 4); // reduce magnitude of the loss
          }
        }
      },
    });

    const a = createEntity('a', [
      { type: 'stats', base: { attack: 10, 'max-hp': 20 } },
      { type: 'resources', pools: { hp: { current: 20 } } },
      { type: 'position', x: 1, y: 1, levelId: 'L' },
    ]);
    const b = createEntity(
      'b',
      [
        { type: 'stats', base: { defense: 0, 'max-hp': 20 } },
        { type: 'resources', pools: { hp: { current: 20 } } },
        { type: 'position', x: 2, y: 1, levelId: 'L' },
      ],
      ['armored'],
    );
    w.state.entities.set('a', a);
    w.state.entities.set('b', b);
    w.state.levels.set('L', { id: 'L', width: 6, height: 6, layers: new Map(), entityIndex: new Map(), metadata: {} });
    w.services.queries.index(a);
    w.services.queries.index(b);
    w.services.queries.place('a', 'L', 1 * 6 + 1);
    w.services.queries.place('b', 'L', 1 * 6 + 2);

    perform(w, { type: 'bump', actor: 'a', dir: { x: 1, y: 0 } });

    // Redirect routed through resolve → the target's pre-phase armor reactor
    // fired on the attack and reduced the damage actually applied.
    expect(armorFired).toBe(1);
    const dealt = 20 - hpOf(b);
    expect(dealt).toBeGreaterThan(0);
    expect(dealt).toBeLessThanOrEqual(10 + defaultConfig.combat.variance - 4);
  });
});
