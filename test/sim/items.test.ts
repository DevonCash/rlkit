import { describe, it, expect } from 'vitest';
import { createWorld, resolve } from '../../src/index';
import { createLevel, levelCell } from '../../src/core/level';
import { createEntity, get, has, type Entity } from '../../src/core/entity';
import type { Inventory, Item } from '../../src/core/component';
import type { Config } from '../../src/config/defaults';
import { defaultConfig } from '../../src/config/defaults';

type W = ReturnType<typeof createWorld>;

function setup(config: Config = defaultConfig) {
  const w = createWorld({ config, rng: 1 });
  const lvl = createLevel('L', 8, 8, 1); // all floor
  w.state.levels.set('L', lvl);
  const cell = levelCell(lvl, 3, 3);
  const carrier = createEntity('hero', [
    { type: 'position', x: 3, y: 3, levelId: 'L' },
    { type: 'inventory', items: [] },
  ]);
  w.state.entities.set('hero', carrier);
  w.services.queries.index(carrier);
  w.services.queries.place('hero', 'L', cell);
  return { w, cell, carrier };
}

function dropItemAt(w: W, id: string, x: number, y: number, item: Partial<Item> = {}): Entity {
  const e = createEntity(id, [
    { type: 'position', x, y, levelId: 'L' },
    { type: 'item', name: id, stackable: false, qty: 1, ...item },
  ]);
  w.state.entities.set(id, e);
  w.services.queries.index(e);
  w.services.queries.place(id, 'L', levelCell(w.state.levels.get('L')!, x, y));
  return e;
}

const inv = (e: Entity) => get<Inventory>(e, 'inventory')!.items;

describe('pickup / drop (§22.9)', () => {
  it('moves the same entity between floor and inventory', () => {
    const { w, cell, carrier } = setup();
    const sword = dropItemAt(w, 'sword', 3, 3);

    expect([...w.services.queries.at(cell, 'L')]).toContain('sword');

    expect(resolve(w, { type: 'pickup', actor: 'hero', item: 'sword' }).status).toBe('done');
    // carried: in inventory, no position, gone from the floor index
    expect(inv(carrier)).toEqual(['sword']);
    expect(has(sword, 'position')).toBe(false);
    expect([...w.services.queries.at(cell, 'L')]).not.toContain('sword');
    expect(w.state.entities.get('sword')).toBe(sword); // same entity

    expect(resolve(w, { type: 'drop', actor: 'hero', item: 'sword' }).status).toBe('done');
    // back on the floor at the hero's cell
    expect(inv(carrier)).toEqual([]);
    expect(has(sword, 'position')).toBe(true);
    expect([...w.services.queries.at(cell, 'L')]).toContain('sword');
  });

  it('rejects pickup of an item not at the actor cell', () => {
    const { w } = setup();
    dropItemAt(w, 'sword', 5, 5);
    expect(resolve(w, { type: 'pickup', actor: 'hero', item: 'sword' }).status).toBe('rejected');
  });

  it('enforces inventory capacity', () => {
    const { w, carrier } = setup();
    get<Inventory>(carrier, 'inventory')!.capacity = 1;
    dropItemAt(w, 'a', 3, 3);
    dropItemAt(w, 'b', 3, 3);
    expect(resolve(w, { type: 'pickup', actor: 'hero', item: 'a' }).status).toBe('done');
    expect(resolve(w, { type: 'pickup', actor: 'hero', item: 'b' }).status).toBe('rejected');
    expect(inv(carrier)).toEqual(['a']);
  });

  it('enforces a configured carry-weight cap', () => {
    const { w, carrier } = setup({ ...defaultConfig, inventory: { defaultCapacity: 26, maxCarryWeight: 5 } });
    dropItemAt(w, 'boulder', 3, 3, { weight: 10 });
    expect(resolve(w, { type: 'pickup', actor: 'hero', item: 'boulder' }).status).toBe('rejected');
    expect(inv(carrier)).toEqual([]);
  });
});
