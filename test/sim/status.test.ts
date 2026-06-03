import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/index';
import { deriveStat, type StatDef } from '../../src/sim/stats';
import { tickActor, applyStatusEffect, type StatusDef } from '../../src/sim/status';
import { resolve } from '../../src/sim/action';
import { createTimeline } from '../../src/sim/timeline';
import { emptyTimelineState } from '../../src/core/world';
import { createEntity, get, type Entity } from '../../src/core/entity';
import type { Resources } from '../../src/core/component';
import type { ResourceDef } from '../../src/sim/resources';
import type { Registry } from '../../src/core/registry';
import type { ActionHandler } from '../../src/core/action';
import { defaultConfig } from '../../src/config/defaults';

type W = ReturnType<typeof createWorld>;
function world(): W {
  const w = createWorld({ config: defaultConfig, rng: 1 });
  (w.services.registries.stats as Registry<StatDef>).override('speed', { id: 'speed', default: 10 });
  (w.services.registries.stats as Registry<StatDef>).override('max-hp', { id: 'max-hp', default: 20 });
  (w.services.registries.resources as Registry<ResourceDef>).override('hp', { id: 'hp', max: 'max-hp' });
  const statuses = w.services.registries.statuses as Registry<StatusDef>;
  statuses.override('haste', { id: 'haste', modifiers: [{ stat: 'speed', phase: 'add', amount: 10 }] });
  statuses.override('poison', { id: 'poison', onTick: { resourceId: 'hp', amount: -2, cause: 'damage' }, onExpire: 'poison:ended' });
  return w;
}
const hpOf = (e: Entity) => get<Resources>(e, 'resources')!.pools.hp!.current;

describe('status — haste raises speed and changes timeline cadence (§22.8 [I])', () => {
  it('deriveStats reflects haste', () => {
    const w = world();
    const e = createEntity('e', [
      { type: 'stats', base: { speed: 10 } },
      { type: 'statuses', active: [{ effectId: 'haste', duration: 100 }] },
    ]);
    w.state.entities.set('e', e);
    expect(deriveStat(e, w, 'speed')).toBe(20);
  });

  it('the hasted (higher derived speed) actor acts measurably more often', () => {
    const state = emptyTimelineState();
    const tl = createTimeline(state, defaultConfig);
    tl.addActor('normal', 10);
    tl.addActor('hasted', 20); // derived speed from base 10 + haste 10
    const counts: Record<string, number> = { normal: 0, hasted: 0 };
    for (let i = 0; i < 6000; i++) {
      const entry = tl.next();
      if (entry.kind === 'actor') {
        counts[entry.id] = (counts[entry.id] ?? 0) + 1;
        tl.reschedule(entry.id, defaultConfig.baseActionCost);
      }
    }
    expect(counts.hasted! / counts.normal!).toBeGreaterThan(1.8);
  });
});

describe('status — poison drains hp each tick; expiry fires onExpire (§22.8 [I])', () => {
  it('drains hp on every per-actor tick', () => {
    const w = world();
    const e = createEntity('e', [
      { type: 'stats', base: { 'max-hp': 20 } },
      { type: 'resources', pools: { hp: { current: 20 } } },
      { type: 'statuses', active: [{ effectId: 'poison', duration: 3 }] },
    ]);
    w.state.entities.set('e', e);

    tickActor(w, 'e');
    expect(hpOf(e)).toBe(18);
    tickActor(w, 'e');
    expect(hpOf(e)).toBe(16);
  });

  it('removes the status and fires onExpire when duration runs out', () => {
    const w = world();
    const e = createEntity('e', [
      { type: 'stats', base: { 'max-hp': 20 } },
      { type: 'resources', pools: { hp: { current: 20 } } },
      { type: 'statuses', active: [{ effectId: 'poison', duration: 2 }] },
    ]);
    w.state.entities.set('e', e);

    tickActor(w, 'e'); // duration 2 → 1
    const events = tickActor(w, 'e'); // duration 1 → 0, expires
    expect(events).toContainEqual({ type: 'poison:ended', entity: 'e' });
    expect(get(e, 'statuses')).toEqual({ type: 'statuses', active: [] });
    expect(hpOf(e)).toBe(16); // 2 ticks of −2
  });

  it('applyStatusEffect adds a status through the pipeline', () => {
    const w = world();
    const e = createEntity('e', [{ type: 'resources', pools: { hp: { current: 20 } } }]);
    w.state.entities.set('e', e);
    (w.services.registries.handlers as Registry<ActionHandler>).register('poison-self', (ctx) => {
      ctx.push(applyStatusEffect(ctx.action.actor, 'poison', 3));
    });
    resolve(w, { type: 'poison-self', actor: 'e' });
    tickActor(w, 'e');
    expect(hpOf(e)).toBe(18);
  });
});
