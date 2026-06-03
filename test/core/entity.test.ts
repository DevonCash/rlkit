import { describe, it, expect } from 'vitest';
import {
  createEntity,
  get,
  has,
  set,
  remove,
  type Entity,
} from '../../src/core/entity';
import type { Position } from '../../src/core/component';

describe('entity accessors', () => {
  it('get/set/has/remove operate by component type', () => {
    const e: Entity = createEntity('e1');
    expect(has(e, 'position')).toBe(false);

    set(e, { type: 'position', x: 1, y: 2, levelId: 'L1' } satisfies Position);
    expect(has(e, 'position')).toBe(true);

    const pos = get<Position>(e, 'position');
    expect(pos?.x).toBe(1);

    // set replaces the component of the same type
    set(e, { type: 'position', x: 9, y: 9, levelId: 'L1' } satisfies Position);
    expect(get<Position>(e, 'position')?.x).toBe(9);

    expect(remove(e, 'position')).toBe(true);
    expect(has(e, 'position')).toBe(false);
    expect(remove(e, 'position')).toBe(false);
  });

  it('seeds components and mixins from the constructor', () => {
    const e = createEntity(
      'goblin',
      [{ type: 'position', x: 0, y: 0, levelId: 'L1' }],
      ['actor', 'desire-ai'],
    );
    expect(has(e, 'position')).toBe(true);
    expect(e.mixins).toEqual(['actor', 'desire-ai']);
  });

  it('a container component holds multiple inner instances by inner id', () => {
    const e = createEntity('hero');
    // The component's data is itself a keyed map of inner instances.
    set(e, {
      type: 'statuses',
      byId: {
        poison: { turns: 3 },
        haste: { turns: 5 },
      },
    });
    const statuses = get(e, 'statuses') as {
      type: 'statuses';
      byId: Record<string, { turns: number }>;
    };
    expect(Object.keys(statuses.byId)).toEqual(['poison', 'haste']);
    expect(statuses.byId.haste!.turns).toBe(5);
  });
});
