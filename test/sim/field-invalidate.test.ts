/**
 * R2 invalidation seam: a field with `invalidateOn:['tile:changed']` re-routes
 * through a wall→floor opening on its next read, and FOV sees through it.
 */
import { describe, it, expect } from 'vitest';
import { makeWorld, makeLevel } from './helpers';
import { setTileEffect } from '../../src/core/tile-effect';
import type { GoalSource } from '../../src/sim/field';
import { setTile, levelCell, isTransparent } from '../../src/core/level';

describe('tile:changed invalidation (§8.1, R2)', () => {
  it('a goal field re-routes through an opened wall on its next read', () => {
    const w = makeWorld();
    const lvl = makeLevel('L', 5, 1); // floor row
    w.state.levels.set('L', lvl);
    const c0 = levelCell(lvl, 0, 0);
    const c2 = levelCell(lvl, 2, 0);
    const c4 = levelCell(lvl, 4, 0);
    setTile(lvl, c2, w.services.tiles.index('wall')); // wall splits the corridor

    const store = w.services.fields.forLevel('L');
    store.ensure({
      id: 'g',
      kind: 'goal',
      params: { source: { kind: 'cells', cells: [c0] } satisfies GoalSource },
      invalidateOn: ['tile:changed'],
    });
    expect(store.data('g')[c4]).toBe(Number.POSITIVE_INFINITY); // unreachable behind the wall

    // Open the wall and fire the event the field subscribed to.
    for (const ev of setTileEffect('L', c2, 'floor').apply(w)) w.services.bus.emit(ev);

    const rerouted = store.data('g')[c4]!;
    expect(Number.isFinite(rerouted)).toBe(true);
    expect(rerouted).toBe(4); // 0→1→2→3→4
  });

  it('FOV transparency is current the same turn a wall opens (reads live tiles)', () => {
    const w = makeWorld();
    const lvl = makeLevel('L', 3, 1);
    w.state.levels.set('L', lvl);
    const c1 = levelCell(lvl, 1, 0);
    setTile(lvl, c1, w.services.tiles.index('wall'));
    expect(isTransparent(lvl, c1, w.services.tiles)).toBe(false);
    setTileEffect('L', c1, 'floor').apply(w);
    expect(isTransparent(lvl, c1, w.services.tiles)).toBe(true); // no cache to invalidate
  });
});
