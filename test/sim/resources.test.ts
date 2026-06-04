import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { createWorld, resolve } from '../../src/index';
import { changeResource, changeResourceEffect, type ResourceDef } from '../../src/sim/resources';
import { createEntity, get, set, type Entity } from '../../src/core/entity';
import type { Resources } from '../../src/core/component';
import type { Registry } from '../../src/core/registry';
import type { StatDef } from '../../src/sim/stats';
import type { GameEvent } from '../../src/core/events';
import type { ActionHandler } from '../../src/core/action';
import { defaultConfig } from '../../src/config/defaults';

type W = ReturnType<typeof createWorld>;
function world() {
  return createWorld({ config: defaultConfig, rng: 1 });
}
function defineHp(w: W, def: Partial<ResourceDef> = {}) {
  (w.services.registries.stats as Registry<StatDef>).override('max-hp', { id: 'max-hp', default: 20 });
  (w.services.registries.resources as Registry<ResourceDef>).override('hp', {
    id: 'hp',
    max: 'max-hp',
    thresholds: [{ at: 0, emit: 'died' }],
    ...def,
  });
}
function combatant(w: W, id: string, hp: number, maxHp = 20): Entity {
  const e = createEntity(id, [
    { type: 'stats', base: { 'max-hp': maxHp } },
    { type: 'resources', pools: { hp: { current: hp } } },
  ]);
  w.state.entities.set(id, e);
  return e;
}
function poolOf(e: Entity, id: string): number {
  return get<Resources>(e, 'resources')!.pools[id]!.current;
}
function statusesOf(e: Entity): { effectId: string; duration: number }[] {
  return (get(e, 'statuses') as { active?: { effectId: string; duration: number }[] } | undefined)?.active ?? [];
}

describe('threshold-triggered statuses (§9.2)', () => {
  it('crossing a bound applies the named status (with its duration) and emits status:applied', () => {
    const w = world();
    defineHp(w, { thresholds: [{ at: 0, emit: 'died' }, { below: 10, status: 'bloodied', duration: 5 }] });
    const e = combatant(w, 'hero', 20);

    // Drop hp from 20 → 6, crossing below 10.
    const events = changeResource(w, 'hero', 'hp', -14, 'damage');
    expect(events).toContainEqual({ type: 'status:applied', entity: 'hero', effectId: 'bloodied' });
    expect(statusesOf(e)).toContainEqual({ effectId: 'bloodied', duration: 5, stacks: 1 });
  });

  it('does not re-apply when the bound is not crossed', () => {
    const w = world();
    defineHp(w, { thresholds: [{ below: 10, status: 'bloodied', duration: 5 }] });
    const e = combatant(w, 'hero', 8); // already below the bound
    const events = changeResource(w, 'hero', 'hp', -1, 'damage'); // 8 → 7, no fresh crossing
    expect(events.some((ev) => ev.type === 'status:applied')).toBe(false);
    expect(statusesOf(e)).toEqual([]);
  });
});

describe('changeResource — clamp & conservation (§22.7)', () => {
  test.prop([fc.integer({ min: 0, max: 20 }), fc.array(fc.integer({ min: -30, max: 30 }), { maxLength: 20 })])(
    'current stays in [0,max]; every unit is applied-or-lost',
    (startHp, deltas) => {
      const w = world();
      defineHp(w);
      const e = combatant(w, 'e', startHp);
      for (const d of deltas) {
        const before = poolOf(e, 'hp');
        const events = changeResource(w, 'e', 'hp', d, 'test');
        const after = poolOf(e, 'hp');
        expect(after).toBeGreaterThanOrEqual(0);
        expect(after).toBeLessThanOrEqual(20);
        const applied = after - before;
        const lost =
          events
            .filter((ev): ev is Extract<GameEvent, { type: 'resource:overflow' }> => ev.type === 'resource:overflow')
            .reduce((s, ev) => s + ev.excess, 0) -
          events
            .filter((ev): ev is Extract<GameEvent, { type: 'resource:underflow' }> => ev.type === 'resource:underflow')
            .reduce((s, ev) => s + ev.deficit, 0);
        expect(applied + lost).toBe(d); // every unit accounted for
      }
    },
  );
});

describe('changeResource — events & causes (§22.7)', () => {
  it('overflow emits excess with the cause', () => {
    const w = world();
    defineHp(w);
    combatant(w, 'e', 18);
    const events = changeResource(w, 'e', 'hp', 5, 'restore');
    expect(events).toContainEqual({ type: 'resource:overflow', entity: 'e', resourceId: 'hp', excess: 3, cause: 'restore' });
  });

  it('underflow emits deficit (overkill) and fires the death threshold', () => {
    const w = world();
    defineHp(w);
    combatant(w, 'e', 4);
    const events = changeResource(w, 'e', 'hp', -10, 'damage');
    expect(events).toContainEqual({ type: 'resource:underflow', entity: 'e', resourceId: 'hp', deficit: 6, cause: 'damage' });
    expect(events).toContainEqual({ type: 'died', entity: 'e' });
  });

  it('a dropping max re-clamps with cause:max-reduced, distinct from restore', () => {
    const w = world();
    defineHp(w);
    const e = combatant(w, 'e', 20, 20);
    // Lower the max stat, then poke with a zero-delta max-reduced change.
    set(e, { type: 'stats', base: { 'max-hp': 12 } });
    const events = changeResource(w, 'e', 'hp', 0, 'max-reduced');
    expect(poolOf(e, 'hp')).toBe(12);
    expect(events).toContainEqual({ type: 'resource:overflow', entity: 'e', resourceId: 'hp', excess: 8, cause: 'max-reduced' });
  });

  it('death threshold is edge-triggered (fires once on crossing)', () => {
    const w = world();
    defineHp(w);
    combatant(w, 'e', 3);
    expect(changeResource(w, 'e', 'hp', -3, 'damage').some((ev) => ev.type === 'died')).toBe(true);
    // already at 0 → no re-fire
    expect(changeResource(w, 'e', 'hp', -1, 'damage').some((ev) => ev.type === 'died')).toBe(false);
  });
});

describe('resource cost rejection (§22.7)', () => {
  it('rejects an action whose cost exceeds the pool', () => {
    const w = world();
    (w.services.registries.stats as Registry<StatDef>).override('max-mana', { id: 'max-mana', default: 10 });
    (w.services.registries.resources as Registry<ResourceDef>).override('mana', { id: 'mana', max: 'max-mana' });
    const caster = createEntity('c', [
      { type: 'stats', base: { 'max-mana': 10 } },
      { type: 'resources', pools: { mana: { current: 3 } } },
    ]);
    w.state.entities.set('c', caster);

    (w.services.registries.handlers as Registry<ActionHandler>).register('cast', (ctx) => {
      ctx.push(changeResourceEffect(ctx.action.actor, 'mana', -5, 'spend', { requireSufficient: true }));
    });

    expect(resolve(w, { type: 'cast', actor: 'c' }).status).toBe('rejected');
    expect(poolOf(caster, 'mana')).toBe(3); // unchanged — no time passed

    // Enough mana → succeeds and spends.
    get<Resources>(caster, 'resources')!.pools.mana!.current = 8;
    expect(resolve(w, { type: 'cast', actor: 'c' }).status).toBe('done');
    expect(poolOf(caster, 'mana')).toBe(3);
  });
});
