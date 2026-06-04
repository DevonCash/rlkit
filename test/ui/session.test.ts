import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/index';
import { createSession } from '../../src/ui/session';
import { AsciiRenderer } from '../../src/render/ascii-renderer';
import { createLevel, levelCell } from '../../src/core/level';
import { createEntity, get, set } from '../../src/core/entity';
import type { Position, Inventory, Equipped } from '../../src/core/component';
import { defaultConfig } from '../../src/config/defaults';
import { deriveStat } from '../../src/sim/stats';
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

describe('Session command-dispatch registry (§14)', () => {
  it('routes a game-registered command through the table and can submit an action', () => {
    const { w, hero } = setup();
    let fired = 0;
    const session = createSession({
      world: w,
      player: 'hero',
      viewport: { width: W, height: H },
      commands: {
        // A custom command that nudges the player east via submit().
        'step-east': (_cmd, ctx) => {
          fired++;
          ctx.submit({ type: 'move', actor: ctx.player, dir: { x: 1, y: 0 } });
        },
      },
    });
    const before = hx(hero);
    session.onCommand({ type: 'step-east' });
    expect(fired).toBe(1);
    expect(hx(hero)).toBe(before + 1); // the submitted action advanced the world
  });

  it('a game command can override a built-in default', () => {
    const { w, hero } = setup();
    let intercepted = 0;
    const session = createSession({
      world: w,
      player: 'hero',
      viewport: { width: W, height: H },
      commands: { 'move-east': () => { intercepted++; } }, // swallow movement
    });
    session.onCommand({ type: 'move-east' });
    expect(intercepted).toBe(1);
    expect(hx(hero)).toBe(5); // world did NOT advance — the override took over
  });

  it('item-default equips a carried weapon (raising its stat) and uses a consumable', () => {
    const { w } = setup();
    // Give the hero an equipped component and two items: a sword and a potion.
    const hero = w.state.entities.get('hero')!;
    hero.mixins.push('equippable');
    w.services.queries.unindex(hero);
    set(hero, { type: 'equipped', slots: {} });
    const inv = get<Inventory>(hero, 'inventory')!;
    const sword = createEntity('sword', [
      { type: 'item', name: 'Sword', stackable: false, qty: 1 },
      { type: 'equipment', slot: 'weapon', bonuses: { attack: 4 } },
    ]);
    const potion = createEntity('potion', [
      { type: 'item', name: 'Potion', stackable: false, qty: 1 },
      { type: 'consumable', uses: 1, effect: 'heal-10' },
    ]);
    w.state.entities.set('sword', sword);
    w.state.entities.set('potion', potion);
    w.services.queries.index(hero);
    w.services.queries.index(sword);
    w.services.queries.index(potion);
    inv.items.push('sword', 'potion');
    // Drop the hero's hp so the heal is observable.
    get<{ type: 'resources'; pools: Record<string, { current: number }> }>(hero, 'resources')!.pools.hp!.current = 5;

    const session = createSession({ world: w, player: 'hero', viewport: { width: W, height: H } });

    // Equip the sword → it lands in the weapon slot, +4 attack flows through.
    const baseAttack = deriveStat(hero, w, 'attack');
    session.dispatch({ type: 'item-default', item: 'sword' });
    expect(deriveStat(hero, w, 'attack')).toBe(baseAttack + 4);
    expect(get<Equipped>(hero, 'equipped')!.slots.weapon).toBe('sword');

    // Dispatch again → toggle unequip (the slot clears).
    session.dispatch({ type: 'item-default', item: 'sword' });
    expect(get<Equipped>(hero, 'equipped')!.slots.weapon).toBeUndefined();

    // Use the potion → heal-10 restores hp and consumes the charge (item gone).
    session.dispatch({ type: 'item-default', item: 'potion' });
    expect(get<{ type: 'resources'; pools: Record<string, { current: number }> }>(hero, 'resources')!.pools.hp!.current).toBe(15);
    expect(w.state.entities.has('potion')).toBe(false);
  });
});
