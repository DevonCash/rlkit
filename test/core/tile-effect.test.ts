/**
 * setTileEffect (§8.1, R2): validates + applies through the pipeline and emits
 * `tile:changed { levelId, cell, from, to }`.
 */
import { describe, it, expect } from 'vitest';
import { setTileEffect } from '../../src/core/tile-effect';
import { makeWorld, makeLevel } from '../sim/helpers';
import { levelCell, tileIndexAt } from '../../src/core/level';

function world() {
  const w = makeWorld();
  const lvl = makeLevel('L', 4, 1); // all floor (index 1)
  w.state.levels.set('L', lvl);
  return { w, lvl };
}

describe('setTileEffect (§8.1)', () => {
  it('swaps the tile and emits tile:changed with from/to indices', () => {
    const { w, lvl } = world();
    const cell = levelCell(lvl, 1, 0);
    const eff = setTileEffect('L', cell, 'wall');
    expect(eff.validate(w)).toBe(true);
    const events = eff.apply(w);
    expect(tileIndexAt(lvl, cell)).toBe(w.services.tiles.index('wall'));
    expect(events).toEqual([
      { type: 'tile:changed', levelId: 'L', cell, from: w.services.tiles.index('floor'), to: w.services.tiles.index('wall') },
    ]);
  });

  it('rejects (validate=false) an unknown tile id or out-of-bounds cell', () => {
    const { w, lvl } = world();
    expect(setTileEffect('L', levelCell(lvl, 0, 0), 'no_such_tile').validate(w)).toBe(false);
    expect(setTileEffect('L', 9999, 'wall').validate(w)).toBe(false);
    expect(setTileEffect('missing', 0, 'wall').validate(w)).toBe(false);
  });

  it('emits nothing for a no-op swap (from === to)', () => {
    const { w, lvl } = world();
    expect(setTileEffect('L', levelCell(lvl, 1, 0), 'floor').apply(w)).toEqual([]);
  });
});
