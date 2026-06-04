import { describe, it, expect } from 'vitest';
import { perform, runReactions } from '../../src/sim/action';
import { get } from '../../src/core/entity';
import type { Resources } from '../../src/core/component';
import { cellOf } from '../../src/core/coords';
import { addZone, addTrigger, addTileTrigger, regionToZone } from '../../src/sim/triggers';
import type { TimerEffect } from '../../src/core/action';
import type { Registry } from '../../src/core/registry';
import { makeWorld, makeLevel, spawnAt } from './helpers';

/** Fire (and consume) a pending timer of `effectId` the way the driver does. */
function fireTimer(w: ReturnType<typeof makeWorld>, effectId: string): void {
  const i = w.state.timeline.timers.findIndex((t) => t.effectId === effectId);
  if (i < 0) return;
  const [timer] = w.state.timeline.timers.splice(i, 1); // the driver pops the due entry
  const fx = (w.services.registries.timerEffects as Registry<TimerEffect>).get(effectId);
  runReactions(w, fx(w, timer!.payload));
}

/** Spawn an entity carrying an hp pool so it can take scripted damage. */
function spawnLiving(w: ReturnType<typeof makeWorld>, id: string, x: number, y: number, hp = 20) {
  const e = spawnAt(w, id, 'L', x, y);
  e.components.set('stats', { type: 'stats', base: { 'max-hp': hp } });
  e.components.set('resources', { type: 'resources', pools: { hp: { current: hp } } });
  w.services.queries.index(e); // pick up the new components in the index
  return e;
}
const hpOf = (e: ReturnType<typeof spawnAt>) => get<Resources>(e, 'resources')!.pools.hp!.current;

describe('movement emits entity:entered/exited (§22.12)', () => {
  it('a relocate move emits exited(from) and entered(to) alongside moved', () => {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 6, 6));
    spawnAt(w, 'hero', 'L', 1, 1);

    const out = perform(w, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } });
    expect(out.status).toBe('done');
    if (out.status === 'done') {
      const from = cellOf({ x: 1, y: 1 }, 6);
      const to = cellOf({ x: 2, y: 1 }, 6);
      expect(out.events).toContainEqual({ type: 'entity:exited', entity: 'hero', cell: from, levelId: 'L' });
      expect(out.events).toContainEqual({ type: 'entity:entered', entity: 'hero', cell: to, levelId: 'L' });
    }
  });
});

describe('damage action (§11A.5)', () => {
  it('drops the target hp through the effect pipeline', () => {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 6, 6));
    const victim = spawnLiving(w, 'victim', 2, 2, 20);

    const out = perform(w, { type: 'damage', actor: 'victim', target: 'victim', amount: 7, cause: 'trap' });
    expect(out.status).toBe('done');
    expect(hpOf(victim)).toBe(13);
  });

  it('rejects when target or amount is missing', () => {
    const w = makeWorld();
    expect(perform(w, { type: 'damage', actor: 'x' }).status).toBe('rejected');
  });
});

describe('cell triggers — event+scope, testId, once (§22.12)', () => {
  function setup() {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 8, 8));
    return w;
  }
  const trapCell = cellOf({ x: 2, y: 1 }, 8);

  it('a cell trigger fires on entity:entered, gated by testId, and respects once', () => {
    const w = setup();
    const hero = spawnLiving(w, 'hero', 1, 1, 20);
    addTrigger(w, {
      id: 't1',
      on: 'entity:entered',
      scope: 'cell',
      levelId: 'L',
      cell: trapCell,
      testId: 'isLiving',
      effectId: 'trap:arm',
      once: true,
      data: { delay: 1, amount: 5 },
    });

    // Step east onto the trap cell → entity:entered → trap arms a detonate timer.
    perform(w, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } });
    expect(w.state.triggers.triggers[0]!.fired).toBe(true);
    fireTimer(w, 'trap:detonate');
    expect(hpOf(hero)).toBe(15);

    // `once`: re-entering does not re-arm (step off, then back on).
    perform(w, { type: 'move', actor: 'hero', dir: { x: -1, y: 0 } });
    perform(w, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } });
    expect(w.state.timeline.timers.some((t) => t.effectId === 'trap:detonate')).toBe(false);
  });

  it('testId gates out a non-living entity', () => {
    const w = setup();
    spawnAt(w, 'rock', 'L', 1, 1); // no resources component → not living
    addTrigger(w, {
      id: 't1', on: 'entity:entered', scope: 'cell', levelId: 'L', cell: trapCell,
      testId: 'isLiving', effectId: 'trap:arm', data: { delay: 1, amount: 5 },
    });
    perform(w, { type: 'move', actor: 'rock', dir: { x: 1, y: 0 } });
    expect(w.state.timeline.timers.some((t) => t.effectId === 'trap:detonate')).toBe(false);
  });

  it('only fires for the cell it is attached to', () => {
    const w = setup();
    spawnLiving(w, 'hero', 1, 3, 20); // row 3, away from the trap on row 1
    addTrigger(w, {
      id: 't1', on: 'entity:entered', scope: 'cell', levelId: 'L', cell: trapCell,
      effectId: 'trap:arm', data: { delay: 1, amount: 5 },
    });
    perform(w, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } }); // enters (2,3), not the trap
    expect(w.state.timeline.timers.some((t) => t.effectId === 'trap:detonate')).toBe(false);
  });
});

describe('zone triggers — room ambush (§20.11)', () => {
  it('a zone trigger strikes an intruder anywhere inside the zone, not outside', () => {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 10, 8));
    // Promote a room rectangle to a zone and attach an ambush.
    const zone = regionToZone({ x: 4, y: 1, width: 3, height: 3 }, 'L', 10, 'ambush-room');
    addZone(w, zone);
    addTrigger(w, {
      id: 'amb', on: 'entity:entered', scope: 'zone', levelId: 'L', zoneId: 'ambush-room',
      effectId: 'ambush:strike', data: { amount: 4 },
    });

    const hero = spawnLiving(w, 'hero', 3, 2, 20); // just outside the zone (x=3)
    perform(w, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } }); // → (4,2), inside the zone
    expect(hpOf(hero)).toBe(16);

    // Moving within the zone strikes again (no `once`); stepping out does not.
    perform(w, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } }); // → (5,2), still inside
    expect(hpOf(hero)).toBe(12);
  });
});

describe('tile triggers — on-step hazard', () => {
  it('a tile-type trigger burns a living entity that steps on it', () => {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 6, 6)); // all floor
    // Make every floor tile a hazard for this world.
    addTileTrigger(w, 'floor', { on: 'entity:entered', effectId: 'hazard:burn', data: { amount: 2 } });
    const hero = spawnLiving(w, 'hero', 1, 1, 20);
    perform(w, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } }); // steps onto floor
    expect(hpOf(hero)).toBe(18);
  });
});
