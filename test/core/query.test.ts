import { describe, it, expect } from 'vitest';
import { createQueries } from '../../src/core/query';
import { createEntity, set, remove, type Entity, type EntityId } from '../../src/core/entity';
import { cellOf } from '../../src/core/coords';

function ids(it: Iterable<Entity>): EntityId[] {
  return [...it].map((e) => e.id);
}

describe('query layer', () => {
  it('with(A,B) returns exactly the entities having both', () => {
    const entities = new Map<EntityId, Entity>();
    const q = createQueries(entities);

    const a = createEntity('a', [
      { type: 'position', x: 0, y: 0, levelId: 'L' },
      { type: 'renderable', glyph: '@', fg: '#fff', layer: 1 },
    ]);
    const b = createEntity('b', [{ type: 'position', x: 1, y: 0, levelId: 'L' }]);
    const c = createEntity('c', [{ type: 'renderable', glyph: 'g', fg: '#0f0', layer: 1 }]);
    for (const e of [a, b, c]) {
      entities.set(e.id, e);
      q.index(e);
    }

    expect(ids(q.with('position')).sort()).toEqual(['a', 'b']);
    expect(ids(q.with('renderable')).sort()).toEqual(['a', 'c']);
    expect(ids(q.with('position', 'renderable'))).toEqual(['a']);
    expect(ids(q.with('nonexistent'))).toEqual([]);
  });

  it('reflects component add/remove', () => {
    const entities = new Map<EntityId, Entity>();
    const q = createQueries(entities);
    const e = createEntity('e', [{ type: 'position', x: 0, y: 0, levelId: 'L' }]);
    entities.set(e.id, e);
    q.index(e);

    expect(ids(q.with('renderable'))).toEqual([]);
    set(e, { type: 'renderable', glyph: '@', fg: '#fff', layer: 1 });
    q.onComponentAdded(e, 'renderable');
    expect(ids(q.with('renderable'))).toEqual(['e']);

    remove(e, 'renderable');
    q.onComponentRemoved(e, 'renderable');
    expect(ids(q.with('renderable'))).toEqual([]);
  });

  it('at(cell) reflects movement', () => {
    const W = 10;
    const entities = new Map<EntityId, Entity>();
    const q = createQueries(entities);
    const e = createEntity('mover');
    entities.set(e.id, e);
    q.index(e);

    const from = cellOf({ x: 2, y: 3 }, W);
    const to = cellOf({ x: 5, y: 3 }, W);
    q.place('mover', 'L', from);
    expect([...q.at(from, 'L')]).toEqual(['mover']);
    expect([...q.at(to, 'L')]).toEqual([]);

    q.place('mover', 'L', to); // move
    expect([...q.at(from, 'L')]).toEqual([]);
    expect([...q.at(to, 'L')]).toEqual(['mover']);
  });

  it('at() disambiguates by level', () => {
    const entities = new Map<EntityId, Entity>();
    const q = createQueries(entities);
    for (const id of ['x', 'y']) {
      const e = createEntity(id);
      entities.set(id, e);
      q.index(e);
    }
    q.place('x', 'L1', 42);
    q.place('y', 'L2', 42);
    expect([...q.at(42, 'L1')]).toEqual(['x']);
    expect([...q.at(42, 'L2')]).toEqual(['y']);
    // Level-agnostic lookup finds both at the same packed cell.
    expect([...q.at(42)].sort()).toEqual(['x', 'y']);
  });

  it('byTag matches the tag index', () => {
    const entities = new Map<EntityId, Entity>();
    const q = createQueries(entities);
    const e = createEntity('torch', [{ type: 'tags', tags: ['flammable', 'light'] }]);
    entities.set(e.id, e);
    q.index(e);
    expect([...q.byTag('flammable')]).toEqual(['torch']);
    expect([...q.byTag('light')]).toEqual(['torch']);
    expect([...q.byTag('frozen')]).toEqual([]);
  });

  it('withMixin returns carriers and iteration order is insertion-stable', () => {
    const entities = new Map<EntityId, Entity>();
    const q = createQueries(entities);
    for (const id of ['first', 'second', 'third']) {
      const e = createEntity(id, [{ type: 'position', x: 0, y: 0, levelId: 'L' }], ['actor']);
      entities.set(id, e);
      q.index(e);
    }
    expect(ids(q.withMixin('actor'))).toEqual(['first', 'second', 'third']);
    expect(ids(q.with('position'))).toEqual(['first', 'second', 'third']);
  });

  it('unindex drops an entity from every index', () => {
    const entities = new Map<EntityId, Entity>();
    const q = createQueries(entities);
    const e = createEntity('gone', [{ type: 'tags', tags: ['x'] }], ['actor']);
    entities.set(e.id, e);
    q.index(e);
    q.place('gone', 'L', 7);

    q.unindex(e);
    entities.delete('gone');
    expect(ids(q.withMixin('actor'))).toEqual([]);
    expect([...q.byTag('x')]).toEqual([]);
    expect([...q.at(7, 'L')]).toEqual([]);
  });
});
