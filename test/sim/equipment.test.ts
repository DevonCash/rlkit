import { describe, it, expect } from 'vitest';
import { createWorld, resolve } from '../../src/index';
import { deriveStat } from '../../src/sim/stats';
import { createEntity, get, type Entity } from '../../src/core/entity';
import type { Equipped, Inventory } from '../../src/core/component';
import { defaultConfig } from '../../src/config/defaults';

function setup() {
  // createWorld registers the `equippable` mixin at the edge.
  const w = createWorld({ config: defaultConfig, rng: 1 });
  const hero = createEntity(
    'hero',
    [
      { type: 'stats', base: { attack: 5 } },
      { type: 'inventory', items: ['sword'] },
      { type: 'equipped', slots: {} },
    ],
    ['equippable'],
  );
  const sword = createEntity('sword', [
    { type: 'item', name: 'sword', stackable: false, qty: 1 },
    { type: 'equipment', slot: 'weapon', bonuses: { attack: 3 } },
  ]);
  w.state.entities.set('hero', hero);
  w.state.entities.set('sword', sword);
  return { w, hero, sword };
}

const slots = (e: Entity) => get<Equipped>(e, 'equipped')!.slots;

describe('equip / unequip (§22.9)', () => {
  it('equip applies the item bonuses to derived stats; unequip removes them', () => {
    const { w, hero } = setup();
    expect(deriveStat(hero, w, 'attack')).toBe(5);

    expect(resolve(w, { type: 'equip', actor: 'hero', item: 'sword' }).status).toBe('done');
    expect(slots(hero)).toEqual({ weapon: 'sword' });
    expect(deriveStat(hero, w, 'attack')).toBe(8); // +3 from the sword

    expect(resolve(w, { type: 'unequip', actor: 'hero', slot: 'weapon' }).status).toBe('done');
    expect(slots(hero)).toEqual({});
    expect(deriveStat(hero, w, 'attack')).toBe(5); // bonus removed
    // the item is still carried, just unworn
    expect(w.state.entities.has('sword')).toBe(true);
  });

  it('rejects equipping an item not in inventory', () => {
    const { w } = setup();
    // 'shield' exists but is not in the hero's inventory.
    w.state.entities.set(
      'shield',
      createEntity('shield', [
        { type: 'item', name: 'shield', stackable: false, qty: 1 },
        { type: 'equipment', slot: 'armor', bonuses: { defense: 2 } },
      ]),
    );
    expect(resolve(w, { type: 'equip', actor: 'hero', item: 'shield' }).status).toBe('rejected');
  });

  it('replacing a slot leaves the previous item carried but unworn', () => {
    const { w, hero } = setup();
    // a second weapon, also carried
    get<Inventory>(hero, 'inventory')!.items.push('axe');
    w.state.entities.set(
      'axe',
      createEntity('axe', [
        { type: 'item', name: 'axe', stackable: false, qty: 1 },
        { type: 'equipment', slot: 'weapon', bonuses: { attack: 5 } },
      ]),
    );
    resolve(w, { type: 'equip', actor: 'hero', item: 'sword' });
    resolve(w, { type: 'equip', actor: 'hero', item: 'axe' });
    expect(slots(hero)).toEqual({ weapon: 'axe' });
    expect(deriveStat(hero, w, 'attack')).toBe(10); // 5 base + 5 axe
  });
});
