import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { createWorld } from '../../src/index';
import { deriveStats, deriveStat, type StatDef } from '../../src/sim/stats';
import { createEntity, set, type Entity } from '../../src/core/entity';
import type { Mixin } from '../../src/core/mixin';
import type { StatModifier } from '../../src/core/stats';
import type { Registry } from '../../src/core/registry';
import { defaultConfig } from '../../src/config/defaults';

function world() {
  return createWorld({ config: defaultConfig, rng: 1 });
}
function statReg(w: ReturnType<typeof world>) {
  return w.services.registries.stats as Registry<StatDef>;
}
function mixinReg(w: ReturnType<typeof world>) {
  return w.services.registries.mixins as Registry<Mixin>;
}

describe('deriveStats — phase order (§22.7)', () => {
  test.prop([fc.array(fc.oneof(
    fc.record({ stat: fc.constant('attack'), phase: fc.constant<'add'>('add'), amount: fc.integer({ min: -10, max: 10 }) }),
    fc.record({ stat: fc.constant('attack'), phase: fc.constant<'mul'>('mul'), amount: fc.double({ min: 0.5, max: 3, noNaN: true }) }),
  ), { minLength: 1, maxLength: 8 })])('result is independent of modifier gather order', (mods) => {
    const compute = (order: StatModifier[]) => {
      const w = world();
      mixinReg(w).register('m', { name: 'm', requires: [], modifyStats: () => order });
      const e = createEntity('e', [{ type: 'stats', base: { attack: 10 } }], ['m']);
      w.state.entities.set('e', e);
      return deriveStat(e, w, 'attack');
    };
    const shuffled = [...mods].reverse();
    expect(compute(mods)).toBeCloseTo(compute(shuffled), 9);
  });

  it('applies base → add → mul in fixed order regardless of array order', () => {
    const w = world();
    // mul listed before add, but add must apply first: (10 + 5) * 2 = 30.
    mixinReg(w).register('m', {
      name: 'm',
      requires: [],
      modifyStats: () => [
        { stat: 'attack', phase: 'mul', amount: 2 },
        { stat: 'attack', phase: 'add', amount: 5 },
      ],
    });
    const e = createEntity('e', [{ type: 'stats', base: { attack: 10 } }], ['m']);
    w.state.entities.set('e', e);
    expect(deriveStat(e, w, 'attack')).toBe(30);
  });
});

describe('deriveStats — sources, removal, clamps (§22.7)', () => {
  it('reflects a status modifier and updates when removed', () => {
    const w = world();
    (w.services.registries.statuses as Registry<{ id: string; modifiers?: StatModifier[] }>).register(
      'haste',
      { id: 'haste', modifiers: [{ stat: 'speed', phase: 'add', amount: 10 }] },
    );
    const e: Entity = createEntity('e', [{ type: 'stats', base: { speed: 10 } }]);
    w.state.entities.set('e', e);
    expect(deriveStat(e, w, 'speed')).toBe(10);

    set(e, { type: 'statuses', active: [{ effectId: 'haste', duration: 50 }] });
    expect(deriveStat(e, w, 'speed')).toBe(20); // status reflected

    set(e, { type: 'statuses', active: [] });
    expect(deriveStat(e, w, 'speed')).toBe(10); // removing the source updates it
  });

  it('respects StatDef clamp bounds', () => {
    const w = world();
    statReg(w).register('hp-frac', { id: 'hp-frac', default: 0, min: 0, max: 1 });
    mixinReg(w).register('over', {
      name: 'over',
      requires: [],
      modifyStats: () => [{ stat: 'hp-frac', phase: 'add', amount: 5 }],
    });
    const e = createEntity('e', [], ['over']);
    w.state.entities.set('e', e);
    expect(deriveStat(e, w, 'hp-frac')).toBe(1); // clamped to max
  });

  it('stacks multiply a status modifier', () => {
    const w = world();
    (w.services.registries.statuses as Registry<{ id: string; modifiers?: StatModifier[] }>).register(
      'might',
      { id: 'might', modifiers: [{ stat: 'attack', phase: 'add', amount: 2 }] },
    );
    const e = createEntity('e', [
      { type: 'stats', base: { attack: 0 } },
      { type: 'statuses', active: [{ effectId: 'might', duration: 10, stacks: 3 }] },
    ]);
    w.state.entities.set('e', e);
    expect(deriveStat(e, w, 'attack')).toBe(6);
  });

  it('includes registered stat defaults even with no base or modifiers', () => {
    const w = world();
    statReg(w).register('sight', { id: 'sight', default: 8 });
    const e = createEntity('e');
    w.state.entities.set('e', e);
    expect(deriveStats(e, w).sight).toBe(8);
  });
});
