/**
 * The determinism golden run + the save/load continuation guarantee (§22.13).
 *
 * This file holds the ONLY snapshot in the suite: a scripted sequence of inputs
 * under a fixed seed produces a recorded event stream. If the stream changes,
 * either a real regression slipped in (fix it) or behavior intentionally changed
 * (update the snapshot deliberately). The continuation test then proves a world
 * saved mid-run and reloaded resumes bit-for-bit.
 */
import { describe, it, expect } from 'vitest';
import { createWorld, encodeSave, loadWorld } from '../../src/index';
import type { World } from '../../src/core/world';
import { takeTurn } from '../../src/sim/driver';
import { createLevel, levelCell } from '../../src/core/level';
import { createEntity, get } from '../../src/core/entity';
import type { Position, Component } from '../../src/core/component';
import type { Action } from '../../src/core/action';
import type { GameEvent } from '../../src/core/events';
import type { Config } from '../../src/config/defaults';
import { defaultConfig } from '../../src/config/defaults';

const config: Config = {
  ...defaultConfig,
  factions: {
    default: 'neutral',
    matrix: { monster: { player: 'hostile' }, player: { monster: 'hostile' } },
  },
};

/** A hero (scripted) and a hostile hunter on a small floor — a deterministic clash. */
function scenario(seed: number): World {
  const w = createWorld({ config, rng: seed });
  const lvl = createLevel('L', 10, 5, 1); // all floor
  w.state.levels.set('L', lvl);

  const place = (id: string, x: number, y: number, extra: Component[], mixins: string[], speed: number) => {
    const e = createEntity(id, [{ type: 'position', x, y, levelId: 'L' }, ...extra], mixins);
    w.state.entities.set(id, e);
    w.services.queries.index(e);
    w.services.queries.place(id, 'L', levelCell(lvl, x, y));
    w.services.timeline.addActor(id, speed);
    return e;
  };

  place(
    'hero',
    1,
    2,
    [
      { type: 'stats', base: { attack: 5, defense: 0, 'max-hp': 20 } },
      { type: 'resources', pools: { hp: { current: 20 } } },
    ],
    [],
    100,
  );
  place(
    'goblin',
    6,
    2,
    [
      { type: 'stats', base: { attack: 3, defense: 0, 'max-hp': 10 } },
      { type: 'resources', pools: { hp: { current: 10 } } },
    ],
    ['aiHunter'],
    100,
  );
  return w;
}

/** Drive turns feeding the scripted player actions; collect the action event stream. */
function drive(w: World, player: string, actions: Action[]): GameEvent[] {
  const queue = [...actions];
  const events: GameEvent[] = [];
  const provider = () => queue.shift();
  for (let guard = 0; guard < 1000; guard++) {
    const r = takeTurn(w, { player, actionProvider: provider });
    if (r.kind === 'idle' || r.kind === 'awaiting-input') break;
    if (r.outcome && r.outcome.status !== 'rejected') events.push(...r.outcome.events);
  }
  return events;
}

const east = (): Action => ({ type: 'move', actor: 'hero', dir: { x: 1, y: 0 } });

describe('determinism golden run (§22.13)', () => {
  it('a scripted run under a fixed seed produces a stable event stream', () => {
    const events = drive(scenario(1234), 'hero', Array.from({ length: 8 }, east));
    expect(events).toMatchSnapshot();
  });

  it('two runs with the same seed + inputs are identical', () => {
    const a = drive(scenario(1234), 'hero', Array.from({ length: 8 }, east));
    const b = drive(scenario(1234), 'hero', Array.from({ length: 8 }, east));
    expect(b).toEqual(a);
  });
});

describe('a world saved mid-run resumes identically (§22.13)', () => {
  it('the loaded world produces the same continued event stream as the original', () => {
    const original = scenario(1234);
    // Run the first half on the original.
    drive(original, 'hero', Array.from({ length: 3 }, east));

    // Save here, reload into a fresh world (services rebuilt from registries).
    const loaded = loadWorld(encodeSave(original), { config });

    // Continue both with the same scripted inputs.
    const rest = Array.from({ length: 6 }, east);
    const contOriginal = drive(original, 'hero', rest);
    const contLoaded = drive(loaded, 'hero', rest);

    expect(contLoaded).toEqual(contOriginal);

    // And the worlds end in the same observable state.
    const hpOf = (w: World, id: string) =>
      (w.state.entities.get(id)?.components.get('resources') as
        | { pools: { hp?: { current: number } } }
        | undefined)?.pools.hp?.current;
    const posOf = (w: World, id: string) => {
      const e = w.state.entities.get(id);
      return e ? get<Position>(e, 'position') : undefined;
    };
    expect(hpOf(loaded, 'goblin')).toBe(hpOf(original, 'goblin'));
    expect(posOf(loaded, 'hero')).toEqual(posOf(original, 'hero'));
  });
});
