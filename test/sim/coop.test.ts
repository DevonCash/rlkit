import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/index';
import { tickRealtimeMulti } from '../../src/sim/driver';
import { isExplored } from '../../src/sim/visibility';
import { createLevel, levelCell, type Level } from '../../src/core/level';
import { createEntity, get } from '../../src/core/entity';
import type { Position, Component } from '../../src/core/component';
import type { Action } from '../../src/core/action';
import type { Config } from '../../src/config/defaults';
import { defaultConfig } from '../../src/config/defaults';

const W = 24;
const H = 9;
const config: Config = {
  ...defaultConfig,
  factions: { default: 'neutral', matrix: { monster: { player: 'hostile' }, player: { monster: 'hostile' } } },
};

function setup() {
  const w = createWorld({ config, rng: 1 });
  const lvl = createLevel('L', W, H, 1); // all floor
  w.state.levels.set('L', lvl);
  return { w, lvl };
}
function place(w: ReturnType<typeof setup>['w'], lvl: Level, id: string, x: number, y: number, extra: Component[], mixins: string[] = []) {
  const e = createEntity(id, [{ type: 'position', x, y, levelId: 'L' }, ...extra], mixins);
  w.state.entities.set(id, e);
  w.services.queries.index(e);
  w.services.queries.place(id, 'L', levelCell(lvl, x, y));
  w.services.timeline.addActor(id, 10);
  return e;
}
const pos = (e: ReturnType<typeof createEntity>) => get<Position>(e, 'position')!;

describe('tickRealtimeMulti (§6) — the co-op driver', () => {
  it('drives two players from their own buffered actions on the shared timeline', () => {
    const { w, lvl } = setup();
    const p1 = place(w, lvl, 'p1', 4, 4, [{ type: 'allegiance', faction: 'player' }]);
    const p2 = place(w, lvl, 'p2', 18, 4, [{ type: 'allegiance', faction: 'player' }]);
    const players = new Set(['p1', 'p2']);
    const actions: Record<string, Action | undefined> = {
      p1: { type: 'move', actor: 'p1', dir: { x: 1, y: 0 } }, // east
      p2: { type: 'move', actor: 'p2', dir: { x: -1, y: 0 } }, // west
    };

    const r = tickRealtimeMulti(w, { players, actionFor: (id) => actions[id], ticks: 1 });
    expect(r.acted.sort()).toEqual(['p1', 'p2']); // both acted on the same tick
    expect(pos(p1).x).toBe(5);
    expect(pos(p2).x).toBe(17);
  });

  it('shares fog: the union of both players reveals both areas', () => {
    const { w, lvl } = setup();
    place(w, lvl, 'p1', 3, 4, [{ type: 'allegiance', faction: 'player' }]);
    place(w, lvl, 'p2', 20, 4, [{ type: 'allegiance', faction: 'player' }]);
    tickRealtimeMulti(w, { players: ['p1', 'p2'], actionFor: () => undefined, ticks: 1 });
    // Both ends of the corridor are explored (each player's surroundings).
    expect(isExplored(lvl, levelCell(lvl, 3, 4))).toBe(true);
    expect(isExplored(lvl, levelCell(lvl, 20, 4))).toBe(true);
  });

  it('runs AI and only idles when EVERY player leaves the timeline', () => {
    const { w, lvl } = setup();
    place(w, lvl, 'p1', 4, 4, [{ type: 'allegiance', faction: 'player' }]);
    place(w, lvl, 'p2', 6, 4, [{ type: 'allegiance', faction: 'player' }]);
    const mon = place(w, lvl, 'mon', 12, 4, [{ type: 'allegiance', faction: 'monster' }], ['aiHunter', 'aiWanderer']); // within sight (≤8)
    const startX = pos(mon).x;

    for (let i = 0; i < 30; i++) tickRealtimeMulti(w, { players: ['p1', 'p2'], actionFor: () => undefined, ticks: 1 });
    expect(pos(mon).x).toBeLessThan(startX); // the hunter closed in (AI ran)

    // One player dies → still not idle (the other plays on).
    w.services.timeline.remove('p1');
    expect(tickRealtimeMulti(w, { players: ['p1', 'p2'], actionFor: () => undefined, ticks: 2 }).idle).toBe(false);
    // Both gone → idle.
    w.services.timeline.remove('p2');
    expect(tickRealtimeMulti(w, { players: ['p1', 'p2'], actionFor: () => undefined, ticks: 2 }).idle).toBe(true);
  });

  it('is deterministic: identical (actionFor, ticks) streams converge', () => {
    const digest = (w: ReturnType<typeof setup>['w']): string =>
      JSON.stringify({
        clock: w.state.timeline.worldClock,
        ents: [...w.state.entities.values()].map((e) => [e.id, get<Position>(e, 'position')]).sort((a, b) => (a[0]! < b[0]! ? -1 : 1)),
      });
    const build = () => {
      const { w, lvl } = setup();
      place(w, lvl, 'p1', 4, 4, [{ type: 'allegiance', faction: 'player' }]);
      place(w, lvl, 'p2', 18, 4, [{ type: 'allegiance', faction: 'player' }]);
      place(w, lvl, 'mon', 11, 6, [{ type: 'allegiance', faction: 'monster' }], ['aiHunter', 'aiWanderer']);
      return w;
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 40; i++) {
      const actionFor = (id: string): Action | undefined =>
        i % 4 === 0 ? { type: 'move', actor: id, dir: { x: id === 'p1' ? 1 : -1, y: 0 } } : undefined;
      tickRealtimeMulti(a, { players: ['p1', 'p2'], actionFor, ticks: 1 });
      tickRealtimeMulti(b, { players: ['p1', 'p2'], actionFor, ticks: 1 });
    }
    expect(digest(a)).toBe(digest(b));
  });
});
