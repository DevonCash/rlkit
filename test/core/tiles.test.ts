import { describe, it, expect } from 'vitest';
import { createTilePalette } from '../../src/core/tiles';
import type { TileType } from '../../src/core/level';

const wall: TileType = { id: 'wall', walkable: false, transparent: false, glyph: '#', fg: '#888' };
const floor: TileType = { id: 'floor', walkable: true, transparent: true, glyph: '.', fg: '#ccc' };

describe('tile palette', () => {
  it('assigns indices in registration order, with index 0 first', () => {
    const p = createTilePalette();
    expect(p.register(wall)).toBe(0);
    expect(p.register(floor)).toBe(1);
    expect(p.index('wall')).toBe(0);
    expect(p.index('floor')).toBe(1);
    expect(p.size).toBe(2);
    expect(p.ids()).toEqual(['wall', 'floor']);
  });

  it('round-trips index ↔ id ↔ def', () => {
    const p = createTilePalette();
    p.register(wall);
    p.register(floor);
    expect(p.byIndex(1)).toBe(floor);
    expect(p.byId('wall')).toBe(wall);
    expect(p.byIndex(p.index('floor')).id).toBe('floor');
  });

  it('throws on unknown id/index and duplicate registration', () => {
    const p = createTilePalette();
    p.register(wall);
    expect(() => p.index('nope')).toThrow(/unknown tile id/);
    expect(() => p.byIndex(9)).toThrow(/out of range/);
    expect(() => p.register(wall)).toThrow(/already registered/);
    expect(p.tryGet('nope')).toBeUndefined();
    expect(p.has('wall')).toBe(true);
  });
});
