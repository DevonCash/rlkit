import { describe, it, expect } from 'vitest';
import { createWorld, buildFrame, AsciiRenderer } from '../../src/index';
import { takeTurn, step } from '../../src/sim/driver';
import { createLevel, levelCell, type Level } from '../../src/core/level';
import { VISIBLE_LAYER } from '../../src/sim/visibility';
import { createEntity, get } from '../../src/core/entity';
import type { Position, Component } from '../../src/core/component';
import type { Action } from '../../src/core/action';
import type { Config } from '../../src/config/defaults';
import { defaultConfig } from '../../src/config/defaults';

const W = 12;
const H = 5;
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
function place(w: ReturnType<typeof setup>['w'], lvl: Level, id: string, x: number, y: number, extra: Component[], mixins: string[] = [], speed?: number) {
  const e = createEntity(id, [{ type: 'position', x, y, levelId: 'L' }, ...extra], mixins);
  w.state.entities.set(id, e);
  w.services.queries.index(e);
  w.services.queries.place(id, 'L', levelCell(lvl, x, y));
  w.services.timeline.addActor(id, speed);
  return e;
}
const px = (e: ReturnType<typeof createEntity>) => get<Position>(e, 'position')!.x;

describe('driver (§6) — turns run end to end', () => {
  it('the player acts on its turn via the action provider, then FOV recomputes', () => {
    const { w, lvl } = setup();
    const hero = place(w, lvl, 'hero', 5, 2, [], [], 100);

    // Provide one east move, then pause.
    const queue: Action[] = [{ type: 'move', actor: 'hero', dir: { x: 1, y: 0 } }];
    const provider = () => queue.shift();
    const r1 = takeTurn(w, { player: 'hero', actionProvider: provider });
    expect(r1.kind).toBe('acted');
    expect(px(hero)).toBe(6); // the player moved east

    // FOV was recomputed for the player.
    expect((lvl.layers.get(VISIBLE_LAYER) as Uint8Array | undefined)?.some((v) => v === 1)).toBe(true);

    const r2 = takeTurn(w, { player: 'hero', actionProvider: provider });
    expect(r2.kind).toBe('awaiting-input'); // provider exhausted → pause
  });

  it('AI takes its own turns (hunts the player), and a scheduled timer-effect fires', () => {
    const { w, lvl } = setup();
    place(w, lvl, 'hero', 3, 2, [
      { type: 'allegiance', faction: 'player' },
      { type: 'stats', base: { 'max-hp': 30 } },
      { type: 'resources', pools: { hp: { current: 30 } } },
    ], [], 100);
    const mon = place(w, lvl, 'mon', 8, 2, [{ type: 'allegiance', faction: 'monster' }], ['aiHunter', 'aiWanderer'], 100);

    // Schedule a delayed pulse and watch for it.
    let pulsed = false;
    w.services.bus.on('pulse', () => (pulsed = true));
    w.services.timeline.schedule(1, 'pulse', { from: 'trap' });

    // Player waits each turn; drive a handful of rounds.
    const provider = (): Action => ({ type: 'wait', actor: 'hero' });
    const monStartX = px(mon);
    for (let i = 0; i < 12; i++) takeTurn(w, { player: 'hero', actionProvider: provider });

    expect(px(mon)).toBeLessThan(monStartX); // the monster closed distance (moved west)
    expect(pulsed).toBe(true); // the scheduled timer-effect fired
  });

  it('idles when the timeline is empty; renders a frame through the ASCII renderer', () => {
    const { w, lvl } = setup();
    const hero = place(w, lvl, 'hero', 5, 2, [{ type: 'renderable', glyph: '@', fg: '#fff', layer: 5 }], [], 100);
    // Mark the hero's cell visible so it shows.
    const vis = new Uint8Array(W * H);
    vis[levelCell(lvl, 5, 2)] = 1;
    lvl.layers.set(VISIBLE_LAYER, vis);

    const renderer = new AsciiRenderer();
    renderer.draw(buildFrame(w, { width: W, height: H }, { centerOn: 'hero' }));
    expect(renderer.rows.length).toBe(H);
    expect(renderer.toString()).toContain('@');
    void hero;

    // With only a non-acting setup and an empty provider, step returns awaiting-input.
    const r = step(w, { player: 'hero', actionProvider: () => undefined });
    expect(r.kind).toBe('awaiting-input');
  });
});
