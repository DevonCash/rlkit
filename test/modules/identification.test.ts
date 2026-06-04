import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/index';
import { identificationModule, displayName } from '../../src/modules/identification';
import { perform } from '../../src/sim/action';
import { createEntity, get } from '../../src/core/entity';
import type { Inventory, Equipped } from '../../src/core/component';
import { defaultConfig } from '../../src/config/defaults';

type Comp = { type: string; [k: string]: unknown };
function setup() {
  return createWorld({ config: defaultConfig, rng: 1, modules: [identificationModule()] });
}
function add(w: ReturnType<typeof setup>, id: string, comps: Comp[]) {
  const e = createEntity(id, comps);
  w.state.entities.set(id, e);
  w.services.queries.index(e);
  return e;
}
const equipped = (w: ReturnType<typeof setup>) => get<Equipped>(w.state.entities.get('hero')!, 'equipped')!;

describe('identificationModule', () => {
  it('shows an appearance until identified; equipping identifies', () => {
    const w = setup();
    add(w, 'ring', [
      { type: 'item', name: 'Ring of Vigor', stackable: false, qty: 1 },
      { type: 'equipment', slot: 'ring', bonuses: { 'max-hp': 8 } },
      { type: 'identity', identified: false, appearance: 'a copper ring' },
    ]);
    add(w, 'hero', [{ type: 'inventory', items: ['ring'] }, { type: 'equipped', slots: {} }]);

    expect(displayName(w, 'ring')).toBe('a copper ring');
    expect(perform(w, { type: 'equip', actor: 'hero', item: 'ring' }).status).toBe('done');
    expect(displayName(w, 'ring')).toBe('Ring of Vigor'); // revealed by wearing it
  });

  it('an identify consumable reveals an unidentified carried item', () => {
    const w = setup();
    add(w, 'scroll', [
      { type: 'item', name: 'Scroll of Identify', stackable: false, qty: 1 },
      { type: 'consumable', uses: 1, effect: 'identify' },
      { type: 'identity', identified: true },
    ]);
    add(w, 'potion', [
      { type: 'item', name: 'Healing Potion', stackable: false, qty: 1 },
      { type: 'identity', identified: false, appearance: 'a fizzy potion' },
    ]);
    add(w, 'hero', [{ type: 'inventory', items: ['scroll', 'potion'] }]);

    expect(displayName(w, 'potion')).toBe('a fizzy potion');
    perform(w, { type: 'useItem', actor: 'hero', item: 'scroll' });
    expect(displayName(w, 'potion')).toBe('Healing Potion');
  });

  it('a cursed item is stuck until removed', () => {
    const w = setup();
    add(w, 'ring', [
      { type: 'item', name: 'Cursed Ring', stackable: false, qty: 1 },
      { type: 'equipment', slot: 'ring', bonuses: { defense: -2 }, cursed: true },
    ]);
    add(w, 'hero', [{ type: 'inventory', items: ['ring'] }, { type: 'equipped', slots: {} }]);

    perform(w, { type: 'equip', actor: 'hero', item: 'ring' });
    expect(equipped(w).slots.ring).toBe('ring');

    expect(perform(w, { type: 'unequip', actor: 'hero', slot: 'ring' }).status).toBe('rejected');
    expect(equipped(w).slots.ring).toBe('ring'); // still stuck

    add(w, 'scroll', [
      { type: 'item', name: 'Scroll of Remove Curse', stackable: false, qty: 1 },
      { type: 'consumable', uses: 1, effect: 'remove-curse' },
    ]);
    get<Inventory>(w.state.entities.get('hero')!, 'inventory')!.items.push('scroll');
    perform(w, { type: 'useItem', actor: 'hero', item: 'scroll' });

    expect(perform(w, { type: 'unequip', actor: 'hero', slot: 'ring' }).status).toBe('done');
    expect(equipped(w).slots.ring).toBeUndefined();
  });
});
