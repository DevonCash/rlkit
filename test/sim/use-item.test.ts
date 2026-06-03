import { describe, it, expect } from 'vitest';
import { createWorld, perform } from '../../src/index';
import { createEntity, get, type Entity } from '../../src/core/entity';
import type { Resources, Inventory, Consumable } from '../../src/core/component';
import { defaultConfig } from '../../src/config/defaults';

function setup() {
  // createWorld registers the core consumable effects (incl. 'heal-10') at the edge.
  const w = createWorld({ config: defaultConfig, rng: 1 });
  const hero = createEntity('hero', [
    { type: 'stats', base: { 'max-hp': 20 } },
    { type: 'resources', pools: { hp: { current: 5 } } },
    { type: 'inventory', items: ['potion'] },
  ]);
  w.state.entities.set('hero', hero);
  return { w, hero };
}

const hpOf = (e: Entity) => get<Resources>(e, 'resources')!.pools.hp!.current;
const inv = (e: Entity) => get<Inventory>(e, 'inventory')!.items;

describe('useItem (§22.9)', () => {
  it('resolves the consumable effect, spends a charge, and destroys the depleted item', () => {
    const { w, hero } = setup();
    w.state.entities.set(
      'potion',
      createEntity('potion', [
        { type: 'item', name: 'potion', stackable: false, qty: 1 },
        { type: 'consumable', uses: 1, effect: 'heal-10' },
      ]),
    );

    const events: string[] = [];
    w.services.bus.on('item:consumed', () => events.push('consumed'));

    const out = perform(w, { type: 'useItem', actor: 'hero', item: 'potion' });
    expect(out.status).toBe('done');
    expect(hpOf(hero)).toBe(15); // healed +10
    expect(events).toContain('consumed');
    expect(inv(hero)).toEqual([]); // removed from inventory
    expect(w.state.entities.has('potion')).toBe(false); // destroyed
  });

  it('a multi-charge item decrements uses and survives until depleted', () => {
    const { w } = setup();
    w.state.entities.set(
      'potion',
      createEntity('potion', [
        { type: 'item', name: 'wand', stackable: false, qty: 1 },
        { type: 'consumable', uses: 2, effect: 'heal-10' },
      ]),
    );

    perform(w, { type: 'useItem', actor: 'hero', item: 'potion' });
    expect(get<Consumable>(w.state.entities.get('potion')!, 'consumable')!.uses).toBe(1);
    expect(w.state.entities.has('potion')).toBe(true);

    perform(w, { type: 'useItem', actor: 'hero', item: 'potion' });
    expect(w.state.entities.has('potion')).toBe(false); // depleted now
  });

  it('rejects using an item not carried or not consumable', () => {
    const { w, hero } = setup();
    get<Inventory>(hero, 'inventory')!.items.push('rock');
    w.state.entities.set('rock', createEntity('rock', [{ type: 'item', name: 'rock', stackable: false, qty: 1 }]));
    expect(perform(w, { type: 'useItem', actor: 'hero', item: 'rock' }).status).toBe('rejected');
    // 'potion' referenced but never created/added
    expect(perform(w, { type: 'useItem', actor: 'hero', item: 'ghost' }).status).toBe('rejected');
  });
});
