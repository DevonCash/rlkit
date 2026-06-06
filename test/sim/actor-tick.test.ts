/**
 * Mixin `onActorTick` (§9.4, R8): a per-actor-turn hook that runs inside tickActor
 * after the built-in regen/status pass — component-gated, mutating, deterministic.
 */
import { describe, it, expect } from 'vitest';
import { makeWorld, makeLevel, spawnAt } from './helpers';
import { get, set } from '../../src/core/entity';
import { takeTurn, tickRealtime } from '../../src/sim/driver';
import type { Mixin } from '../../src/core/mixin';
import type { Registry } from '../../src/core/registry';
import type { World } from '../../src/core/world';
import type { Resources } from '../../src/core/component';
import { changeResource } from '../../src/sim/resources';

const mixinReg = (w: World) => w.services.registries.mixins as Registry<Mixin>;
const wait = (id: string) => () => ({ type: 'wait', actor: id });

/** A world with level 'L' and a single timeline actor 'a' at (1,0). */
function actorWorld(mixins: string[] = []) {
  const w = makeWorld();
  w.state.levels.set('L', makeLevel('L', 6, 1));
  const a = spawnAt(w, 'a', 'L', 1, 0, mixins);
  w.services.timeline.addActor('a', 100); // speed == baseActionCost → one turn per world-tick
  return { w, a };
}

describe('mixin onActorTick (§9.4, R8)', () => {
  it('fires exactly once per actor turn under takeTurn, receiving the acting entity', () => {
    const { w } = actorWorld(['breather']);
    const seen: string[] = [];
    mixinReg(w).register('breather', { name: 'breather', requires: [], onActorTick: (self) => (seen.push(self.id), []) });

    for (let i = 0; i < 3; i++) takeTurn(w, { player: 'a', actionProvider: wait('a') });
    expect(seen).toEqual(['a', 'a', 'a']); // once per turn, no statuses needed
  });

  it('does NOT fire for an entity that lacks the mixin (component-gated)', () => {
    const { w } = actorWorld([]); // 'a' carries no mixin
    let fired = 0;
    mixinReg(w).register('breather', { name: 'breather', requires: [], onActorTick: () => (fired++, []) });
    for (let i = 0; i < 3; i++) takeTurn(w, { player: 'a', actionProvider: wait('a') });
    expect(fired).toBe(0);
  });

  it('fires under tickRealtime too', () => {
    const { w } = actorWorld(['breather']);
    const seen: string[] = [];
    mixinReg(w).register('breather', { name: 'breather', requires: [], onActorTick: (self) => (seen.push(self.id), []) });
    tickRealtime(w, { player: 'a', ticks: 3 });
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen.every((id) => id === 'a')).toBe(true);
  });

  it('may mutate (a hook draining a resource changes it via changeResource)', () => {
    const { w, a } = actorWorld(['breather']);
    set(a, { type: 'stats', base: { 'max-hp': 10 } });
    set(a, { type: 'resources', pools: { hp: { current: 10 } } });
    mixinReg(w).register('breather', {
      name: 'breather', requires: [],
      onActorTick: (self, world) => changeResource(world, self.id, 'hp', -1, 'breathe'),
    });
    takeTurn(w, { player: 'a', actionProvider: wait('a') });
    expect(get<Resources>(w.state.entities.get('a')!, 'resources')!.pools.hp?.current).toBe(9);
  });

  it('a hook that emits died unschedules the actor (via the death reactor)', () => {
    const { w } = actorWorld(['doomed']);
    mixinReg(w).register('doomed', { name: 'doomed', requires: [], onActorTick: (self) => [{ type: 'died', entity: self.id }] });
    expect(w.state.timeline.actors.some((t) => t.id === 'a')).toBe(true);
    takeTurn(w, { player: 'a', actionProvider: wait('a') });
    expect(w.state.timeline.actors.some((t) => t.id === 'a')).toBe(false);
  });

  it('runs an entity’s mixins in declared order (deterministic)', () => {
    const { w } = actorWorld(['m1', 'm2']);
    const order: string[] = [];
    mixinReg(w).register('m1', { name: 'm1', requires: [], onActorTick: () => (order.push('m1'), []) });
    mixinReg(w).register('m2', { name: 'm2', requires: [], onActorTick: () => (order.push('m2'), []) });
    takeTurn(w, { player: 'a', actionProvider: wait('a') });
    expect(order).toEqual(['m1', 'm2']);
  });
});
