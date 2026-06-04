import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/index';
import { tickRealtime } from '../../src/sim/driver';
import { createLevel, levelCell, type Level } from '../../src/core/level';
import { VISIBLE_LAYER } from '../../src/sim/visibility';
import { createEntity, get } from '../../src/core/entity';
import type { Position, Component } from '../../src/core/component';
import type { Config } from '../../src/config/defaults';
import { defaultConfig } from '../../src/config/defaults';

const W = 14;
const H = 5;
const config: Config = {
  ...defaultConfig,
  factions: { default: 'neutral', matrix: { monster: { player: 'hostile' }, player: { monster: 'hostile' } } },
};

function setup() {
  const w = createWorld({ config, rng: 1 });
  const lvl = createLevel('L', W, H, 1); // all floor
  lvl.layers.set(VISIBLE_LAYER, new Uint8Array(W * H).fill(1)); // fully visible so AI can see
  w.state.levels.set('L', lvl);
  return { w, lvl };
}
function place(w: ReturnType<typeof setup>['w'], lvl: Level, id: string, x: number, y: number, extra: Component[], mixins: string[] = []) {
  const e = createEntity(id, [{ type: 'position', x, y, levelId: 'L' }, ...extra], mixins);
  w.state.entities.set(id, e);
  w.services.queries.index(e);
  w.services.queries.place(id, 'L', levelCell(lvl, x, y));
  w.services.timeline.addActor(id, 10); // default speed → acts every 10 ticks
  return e;
}
const px = (e: ReturnType<typeof createEntity>) => get<Position>(e, 'position')!.x;

describe('tickRealtime (§6) — the real-time driver', () => {
  it('consumes the buffered action on the player turn, else waits; time passes', () => {
    const { w, lvl } = setup();
    const hero = place(w, lvl, 'hero', 5, 2, []);

    // First call: the player is due now → the buffered move is consumed.
    const r1 = tickRealtime(w, { player: 'hero', action: { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } }, ticks: 1 });
    expect(r1.playerActed).toBe(true);
    expect(px(hero)).toBe(6);
    expect(r1.worldClock).toBe(1);

    // Player isn't due again for ~10 ticks: a tick with no buffer does NOT move it.
    const r2 = tickRealtime(w, { player: 'hero', ticks: 1 });
    expect(r2.playerActed).toBe(false);
    expect(px(hero)).toBe(6);
  });

  it('drives AI on its own clock without blocking', () => {
    const { w, lvl } = setup();
    place(w, lvl, 'hero', 3, 2, [{ type: 'allegiance', faction: 'player' }, { type: 'stats', base: { 'max-hp': 30 } }, { type: 'resources', pools: { hp: { current: 30 } } }]);
    const mon = place(w, lvl, 'mon', 10, 2, [{ type: 'allegiance', faction: 'monster' }], ['aiHunter', 'aiWanderer']);
    const startX = px(mon);

    // Advance ~40 ticks (player just waits); the hunter should close distance.
    for (let i = 0; i < 40; i++) tickRealtime(w, { player: 'hero', ticks: 1 });
    expect(px(mon)).toBeLessThan(startX);
  });

  it('reports idle once the player leaves the timeline (death)', () => {
    const { w, lvl } = setup();
    place(w, lvl, 'hero', 5, 2, []);
    w.services.timeline.remove('hero');
    expect(tickRealtime(w, { player: 'hero', ticks: 5 }).idle).toBe(true);
  });

  it('is deterministic: the same per-tick (action, ticks) stream yields identical state', () => {
    const digest = (w: ReturnType<typeof setup>['w']): string =>
      JSON.stringify({
        clock: w.state.timeline.worldClock,
        actors: w.state.timeline.actors.map((a) => [a.id, a.energy, a.clock]).sort(),
        ents: [...w.state.entities.values()]
          .map((e) => [e.id, get<Position>(e, 'position')])
          .sort((a, b) => (a[0]! < b[0]! ? -1 : 1)),
      });

    const build = () => {
      const { w, lvl } = setup();
      place(w, lvl, 'hero', 3, 2, [{ type: 'allegiance', faction: 'player' }]);
      place(w, lvl, 'mon', 9, 2, [{ type: 'allegiance', faction: 'monster' }], ['aiHunter', 'aiWanderer']);
      return w;
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 50; i++) {
      const opts = i % 5 === 0
        ? { player: 'hero', ticks: 1, action: { type: 'move' as const, actor: 'hero', dir: { x: 0, y: 1 } } }
        : { player: 'hero', ticks: 1 };
      tickRealtime(a, opts);
      tickRealtime(b, opts);
    }
    expect(digest(a)).toBe(digest(b));
  });
});
