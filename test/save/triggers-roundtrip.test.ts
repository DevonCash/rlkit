import { describe, it, expect } from 'vitest';
import { createWorld, encodeSave, loadWorld } from '../../src/index';
import { addZone, addTrigger, regionToZone } from '../../src/sim/triggers';
import { perform, runReactions } from '../../src/sim/action';
import type { World } from '../../src/core/world';
import { createEntity, get } from '../../src/core/entity';
import type { Resources } from '../../src/core/component';
import { createLevel } from '../../src/core/level';
import { cellOf } from '../../src/core/coords';
import type { TimerEffect } from '../../src/core/action';
import type { Registry } from '../../src/core/registry';
import { defaultConfig } from '../../src/config/defaults';

function living(w: World, id: string, x: number, y: number, hp = 20) {
  const e = createEntity(id, [
    { type: 'position', x, y, levelId: 'L' },
    { type: 'stats', base: { 'max-hp': hp } },
    { type: 'resources', pools: { hp: { current: hp } } },
  ]);
  w.state.entities.set(id, e);
  w.services.queries.index(e);
  w.services.queries.place(id, 'L', cellOf({ x, y }, 10));
  return e;
}
const hpOf = (w: World, id: string) =>
  get<Resources>(w.state.entities.get(id)!, 'resources')!.pools.hp!.current;

function fireTimer(w: World, effectId: string): void {
  const i = w.state.timeline.timers.findIndex((t) => t.effectId === effectId);
  if (i < 0) return;
  const [timer] = w.state.timeline.timers.splice(i, 1);
  const fx = (w.services.registries.timerEffects as Registry<TimerEffect>).get(effectId);
  runReactions(w, fx(w, timer!.payload));
}

describe('triggers survive save/load (§20.11)', () => {
  it('round-trips zones + trigger instances (fired + data) and pending trap timers', () => {
    const w = createWorld({ config: defaultConfig, rng: 7 });
    w.state.levels.set('L', createLevel('L', 10, 8, 1));

    addZone(w, regionToZone({ x: 4, y: 1, width: 3, height: 3 }, 'L', 10, 'ambush-room'));
    addTrigger(w, {
      id: 'trap1', on: 'entity:entered', scope: 'cell', levelId: 'L',
      cell: cellOf({ x: 2, y: 1 }, 10), testId: 'isLiving', effectId: 'trap:arm',
      once: true, data: { delay: 1, amount: 5 },
    });
    addTrigger(w, {
      id: 'amb1', on: 'entity:entered', scope: 'zone', levelId: 'L',
      zoneId: 'ambush-room', effectId: 'ambush:strike', once: true, fired: true, // already sprung
    });
    // A pending detonate timer to prove timeline + triggers both ride along.
    w.services.timeline.schedule(2, 'trap:detonate', { cell: cellOf({ x: 2, y: 1 }, 10), levelId: 'L', amount: 5 });

    const loaded = loadWorld(encodeSave(w), { config: defaultConfig });

    expect(loaded.state.triggers).toEqual(w.state.triggers);
    expect(loaded.state.triggers.triggers.find((t) => t.id === 'amb1')!.fired).toBe(true);
    expect(loaded.state.timeline.timers.some((t) => t.effectId === 'trap:detonate')).toBe(true);
  });

  it('a loaded trap still arms + detonates on entry (ids re-resolve on load)', () => {
    const w = createWorld({ config: defaultConfig, rng: 11 });
    w.state.levels.set('L', createLevel('L', 10, 8, 1));
    addTrigger(w, {
      id: 'trap1', on: 'entity:entered', scope: 'cell', levelId: 'L',
      cell: cellOf({ x: 2, y: 1 }, 10), testId: 'isLiving', effectId: 'trap:arm',
      once: true, data: { delay: 1, amount: 6 },
    });

    // Save BEFORE the victim arrives, then reconstruct and play on the loaded world.
    const loaded = loadWorld(encodeSave(w), { config: defaultConfig });
    living(loaded, 'hero', 1, 1, 20);

    perform(loaded, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } }); // onto the trap cell
    expect(loaded.state.triggers.triggers[0]!.fired).toBe(true);
    fireTimer(loaded, 'trap:detonate');
    expect(hpOf(loaded, 'hero')).toBe(14);
  });
});
