import { describe, it, expect } from 'vitest';
import { TagIndex, Tagged } from '../../src/core/tags';

describe('tags', () => {
  it('Tagged schema validates a tags component', () => {
    expect(Tagged.parse({ type: 'tags', tags: ['flammable', 'undead'] })).toEqual({
      type: 'tags',
      tags: ['flammable', 'undead'],
    });
    expect(() => Tagged.parse({ type: 'tags', tags: [1, 2] })).toThrow();
  });

  it('reflects tag add/remove in lookups', () => {
    const idx = new TagIndex();
    idx.set('a', ['flammable', 'undead']);
    idx.set('b', ['flammable']);

    expect([...idx.get('flammable')]).toEqual(['a', 'b']);
    expect([...idx.get('undead')]).toEqual(['a']);
    expect(idx.has('a', 'undead')).toBe(true);

    // Re-setting replaces the entity's tag set.
    idx.set('a', ['frozen']);
    expect([...idx.get('flammable')]).toEqual(['b']);
    expect([...idx.get('frozen')]).toEqual(['a']);
    expect(idx.has('a', 'undead')).toBe(false);

    // Clearing drops it from every tag, and empty tags prune.
    idx.clear('b');
    expect([...idx.get('flammable')]).toEqual([]);
  });

  it('iteration is insertion-stable', () => {
    const idx = new TagIndex();
    idx.set('x', ['t']);
    idx.set('y', ['t']);
    idx.set('z', ['t']);
    expect([...idx.get('t')]).toEqual(['x', 'y', 'z']);
  });
});
