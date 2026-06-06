/**
 * Tile-flag registry + palette flag bits (§8.1, R1).
 */
import { describe, it, expect } from 'vitest';
import { createFlagRegistry, MAX_FLAGS } from '../../src/core/flags';
import { createTilePalette } from '../../src/core/tiles';
import { createLevel, setTile, isWalkable, isTransparent, levelCell } from '../../src/core/level';

describe('FlagRegistry (§8.1)', () => {
  it('pre-registers walkable=0, transparent=1 and assigns the rest in order', () => {
    const f = createFlagRegistry();
    expect(f.bit('walkable')).toBe(0);
    expect(f.bit('transparent')).toBe(1);
    expect(f.register('airtight')).toBe(2);
    expect(f.register('wire')).toBe(3);
    expect(f.has('airtight')).toBe(true);
    expect(f.names()).toEqual(['walkable', 'transparent', 'airtight', 'wire']);
  });

  it('mask composes named flags into a bitmask', () => {
    const f = createFlagRegistry();
    f.register('airtight'); // bit 2
    expect(f.mask(['walkable', 'airtight'])).toBe((1 << 0) | (1 << 2));
  });

  it('throws on duplicate, unknown, and overflow', () => {
    const f = createFlagRegistry();
    expect(() => f.register('walkable')).toThrow(/already registered/);
    expect(() => f.bit('nope')).toThrow(/unknown flag/);
    for (let i = f.size; i < MAX_FLAGS; i++) f.register(`flag${i}`);
    expect(() => f.register('overflow')).toThrow(/exceeds/);
  });
});

describe('TilePalette flag bits (§8.1)', () => {
  it('folds walkable/transparent booleans + named flags into flagBits', () => {
    const flags = createFlagRegistry();
    flags.register('airtight');
    const p = createTilePalette(flags);
    const wall = p.register({ id: 'wall', walkable: false, transparent: false, glyph: '#', fg: '#666' });
    const floor = p.register({ id: 'floor', walkable: true, transparent: true, glyph: '.', fg: '#aaa' });
    const window = p.register({
      id: 'window', walkable: false, transparent: true, glyph: '"', fg: '#9cf', flags: ['airtight'],
    });

    expect(p.flagBits(wall)).toBe(0);
    expect(p.flagBits(floor)).toBe(p.walkableMask | p.transparentMask);
    // An intact window: airtight + transparent, but NOT walkable.
    expect(p.flagBits(window)).toBe(p.transparentMask | (1 << flags.bit('airtight')));
    expect(p.flagBits(window) & p.walkableMask).toBe(0);
  });

  it('isWalkable/isTransparent read the flag bits (regression)', () => {
    const flags = createFlagRegistry();
    const p = createTilePalette(flags);
    p.register({ id: 'wall', walkable: false, transparent: false, glyph: '#', fg: '#666' });
    p.register({ id: 'floor', walkable: true, transparent: true, glyph: '.', fg: '#aaa' });
    const lvl = createLevel('L', 3, 1, 1); // all floor (index 1)
    setTile(lvl, levelCell(lvl, 0, 0), 0); // wall

    expect(isWalkable(lvl, levelCell(lvl, 0, 0), p)).toBe(false);
    expect(isTransparent(lvl, levelCell(lvl, 0, 0), p)).toBe(false);
    expect(isWalkable(lvl, levelCell(lvl, 1, 0), p)).toBe(true);
    expect(isTransparent(lvl, levelCell(lvl, 1, 0), p)).toBe(true);
  });

  it('throws when a tile references an unregistered flag', () => {
    const p = createTilePalette(createFlagRegistry());
    expect(() =>
      p.register({ id: 'x', walkable: true, transparent: true, glyph: '.', fg: '#aaa', flags: ['nope'] }),
    ).toThrow(/unknown flag/);
  });
});
