import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/index';
import { createSession } from '../../src/ui/session';
import { AsciiRenderer } from '../../src/render/ascii-renderer';
import { createLevel, levelCell } from '../../src/core/level';
import { createEntity, get } from '../../src/core/entity';
import type { Position } from '../../src/core/component';
import { defaultConfig } from '../../src/config/defaults';
import { VISIBLE_LAYER } from '../../src/sim/visibility';

const W = 16;
const H = 8;

function setup() {
  const w = createWorld({ config: defaultConfig, rng: 1 });
  const lvl = createLevel('L', W, H, 1); // all floor
  w.state.levels.set('L', lvl);
  // Make the level fully visible so the HUD/world render deterministically.
  lvl.layers.set(VISIBLE_LAYER, new Uint8Array(W * H).fill(1));
  const hero = createEntity('hero', [
    { type: 'position', x: 5, y: 4, levelId: 'L' },
    { type: 'renderable', glyph: '@', fg: '#fff', layer: 5 },
    { type: 'stats', base: { 'max-hp': 20 } },
    { type: 'resources', pools: { hp: { current: 20 } } },
    { type: 'inventory', items: [] },
  ]);
  w.state.entities.set('hero', hero);
  w.services.queries.index(hero);
  w.services.queries.place('hero', 'L', levelCell(lvl, 5, 4));
  w.services.timeline.addActor('hero', 100);
  return { w, hero };
}
const hx = (h: ReturnType<typeof createEntity>) => get<Position>(h, 'position')!.x;

describe('Session routing (§22.14)', () => {
  it('routes movement to the world; an open modal captures input; cancel restores world input', () => {
    const { w, hero } = setup();
    const renderer = new AsciiRenderer();
    const session = createSession({ world: w, player: 'hero', renderer, viewport: { width: W, height: H } });

    // 1) Movement reaches the world.
    session.onCommand({ type: 'move-east' });
    expect(hx(hero)).toBe(6);
    expect(session.stack.size).toBe(0);

    // 2) Open inventory → a modal is on the stack.
    session.onCommand({ type: 'open-inventory' });
    expect(session.stack.size).toBe(1);

    // 3) Movement now routes to the modal — the world does NOT advance.
    const before = hx(hero);
    session.onCommand({ type: 'move-east' });
    expect(hx(hero)).toBe(before); // world unchanged: the modal captured it

    // 4) Cancel closes the modal; movement reaches the world again.
    session.onCommand({ type: 'cancel' });
    expect(session.stack.size).toBe(0);
    session.onCommand({ type: 'move-east' });
    expect(hx(hero)).toBe(before + 1);
  });

  it('renders the world frame with the player and HUD via the ASCII renderer', () => {
    const { w } = setup();
    const renderer = new AsciiRenderer();
    const session = createSession({ world: w, player: 'hero', renderer, viewport: { width: W, height: H } });
    session.render();
    expect(renderer.toString()).toContain('@'); // the player
    expect(renderer.toString()).toContain('HP 20/20'); // the HUD status line
  });

  it('a full-screen modal replaces the world frame', () => {
    const { w } = setup();
    const renderer = new AsciiRenderer();
    const session = createSession({ world: w, player: 'hero', renderer, viewport: { width: W, height: H } });
    session.onCommand({ type: 'open-inventory' });
    expect(renderer.toString()).toContain('Inventory'); // the list modal title
  });

  it('composites the message log into the world frame', () => {
    const { w } = setup();
    const renderer = new AsciiRenderer();
    const session = createSession({ world: w, player: 'hero', renderer, viewport: { width: W, height: H } });
    // A move emits `moved` → the session's message log narrates it via the
    // config template, and the log view is composited over the world frame.
    session.onCommand({ type: 'move-east' });
    expect(renderer.toString()).toContain('hero moves.');
  });
});
