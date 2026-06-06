/**
 * Composed-flag index (§8.1, R1): the maintained `flags` layer = tile bits |
 * occupant `tileFlags` bits, kept current incrementally + emitting `flags:changed`.
 */
import { describe, it, expect } from 'vitest';
import { makeWorld, makeLevel, spawnAt } from './helpers';
import { set } from '../../src/core/entity';
import type { TileFlags } from '../../src/core/component';
import { setTile, levelCell } from '../../src/core/level';
import type { GameEvent } from '../../src/core/events';

function withAirtight(world = makeWorld()) {
  world.services.flags.register('airtight');
  const lvl = makeLevel('L', 6, 1); // all floor
  world.state.levels.set('L', lvl);
  return { world, lvl };
}

describe('composed flag index (§8.1)', () => {
  it('composes tile bits with occupant tileFlags bits', () => {
    const { world, lvl } = withAirtight();
    const airtightBit = 1 << world.services.flags.bit('airtight');
    // A sealing entity at (2,0) contributing `airtight`.
    const e = spawnAt(world, 'door', 'L', 2, 0);
    set(e, { type: 'tileFlags', flags: ['airtight'] } as TileFlags);

    const idx = world.services.flagIndex.forLevel('L');
    const c2 = levelCell(lvl, 2, 0);
    const c3 = levelCell(lvl, 3, 0);
    // Floor is walkable+transparent everywhere; (2,0) additionally airtight.
    expect(idx.flagsAt(c2) & airtightBit).toBe(airtightBit);
    expect(idx.hasFlagAt(c2, 'airtight')).toBe(true);
    expect(idx.hasFlagAt(c3, 'airtight')).toBe(false);
    expect(idx.hasFlagAt(c3, 'walkable')).toBe(true);
  });

  it('updates incrementally as the contributing entity moves (entered/exited)', () => {
    const { world, lvl } = withAirtight();
    const e = spawnAt(world, 'door', 'L', 2, 0);
    set(e, { type: 'tileFlags', flags: ['airtight'] } as TileFlags);
    const idx = world.services.flagIndex.forLevel('L');
    const c2 = levelCell(lvl, 2, 0);
    const c4 = levelCell(lvl, 4, 0);

    // Relocate (2,0) → (4,0): update the spatial index, then fire the move events.
    set(e, { type: 'position', x: 4, y: 0, levelId: 'L' });
    world.services.queries.place('door', 'L', c4);
    world.services.bus.emit({ type: 'entity:exited', entity: 'door', cell: c2, levelId: 'L' });
    world.services.bus.emit({ type: 'entity:entered', entity: 'door', cell: c4, levelId: 'L' });

    expect(idx.hasFlagAt(c2, 'airtight')).toBe(false);
    expect(idx.hasFlagAt(c4, 'airtight')).toBe(true);
  });

  it('invalidateCell reflects an in-place flag change and emits flags:changed', () => {
    const { world, lvl } = withAirtight();
    const e = spawnAt(world, 'door', 'L', 2, 0);
    set(e, { type: 'tileFlags', flags: ['airtight'] } as TileFlags);
    const idx = world.services.flagIndex.forLevel('L');
    const c2 = levelCell(lvl, 2, 0);

    const events: GameEvent[] = [];
    world.services.bus.on('flags:changed', (ev) => events.push(ev));

    // Door "opens" in place: drop its airtight contribution, then invalidate.
    set(e, { type: 'tileFlags', flags: [] } as TileFlags);
    idx.invalidateCell(c2);

    expect(idx.hasFlagAt(c2, 'airtight')).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'flags:changed', levelId: 'L', cell: c2 });
  });

  it('disposeLevel unsubscribes the index (no further reaction to events)', () => {
    const { world, lvl } = withAirtight();
    const e = spawnAt(world, 'door', 'L', 2, 0);
    set(e, { type: 'tileFlags', flags: ['airtight'] } as TileFlags);
    const idx = world.services.flagIndex.forLevel('L');
    const c2 = levelCell(lvl, 2, 0);
    expect(idx.hasFlagAt(c2, 'airtight')).toBe(true);

    world.services.flagIndex.disposeLevel('L');
    // The disposed index no longer reacts; a tile:changed won't update its layer.
    let fired = 0;
    world.services.bus.on('flags:changed', () => fired++);
    world.services.bus.emit({ type: 'tile:changed', levelId: 'L', cell: c2, from: 1, to: 0 });
    expect(fired).toBe(0); // the old subscription is gone
    // A fresh index is created on next access.
    expect(world.services.flagIndex.forLevel('L')).not.toBe(idx);
  });

  it('picks up a tile:changed (window smashed → airtight tile removed)', () => {
    const { world, lvl } = withAirtight();
    // Register an airtight window tile and a plain floor swap target.
    world.services.tiles.register({
      id: 'window', walkable: false, transparent: true, glyph: '"', fg: '#9cf', flags: ['airtight'],
    });
    const windowIdx = world.services.tiles.index('window');
    const c1 = levelCell(lvl, 1, 0);
    setTile(lvl, c1, windowIdx); // place the window before the index builds

    const idx = world.services.flagIndex.forLevel('L');
    expect(idx.hasFlagAt(c1, 'airtight')).toBe(true);

    // Smash it → floor (index 1); fire tile:changed so the index recomputes.
    setTile(lvl, c1, world.services.tiles.index('floor'));
    world.services.bus.emit({ type: 'tile:changed', levelId: 'L', cell: c1, from: windowIdx, to: 1 });
    expect(idx.hasFlagAt(c1, 'airtight')).toBe(false);
  });
});
