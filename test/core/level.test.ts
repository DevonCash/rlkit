import { describe, it, expect } from 'vitest';
import {
  createLevel,
  tilesLayer,
  tileAt,
  tileIndexAt,
  setTile,
  isWalkable,
  isTransparent,
  levelCell,
} from '../../src/core/level';
import { createTilePalette } from '../../src/core/tiles';
import type { TileType } from '../../src/core/level';

const wall: TileType = { id: 'wall', walkable: false, transparent: false, glyph: '#', fg: '#888' };
const floor: TileType = { id: 'floor', walkable: true, transparent: true, glyph: '.', fg: '#ccc' };

function palette() {
  const p = createTilePalette();
  p.register(wall); // 0
  p.register(floor); // 1
  return p;
}

describe('level helpers', () => {
  it('createLevel allocates a tiles layer filled with the default (wall=0)', () => {
    const lvl = createLevel('L', 4, 3);
    expect(lvl.width).toBe(4);
    expect(lvl.height).toBe(3);
    const tiles = tilesLayer(lvl);
    expect(tiles.length).toBe(12);
    expect([...tiles].every((v) => v === 0)).toBe(true);
    expect(lvl.entityIndex.size).toBe(0);
  });

  it('setTile / tileIndexAt / tileAt resolve through the palette', () => {
    const p = palette();
    const lvl = createLevel('L', 5, 5);
    const c = levelCell(lvl, 2, 1);
    setTile(lvl, c, p.index('floor'));
    expect(tileIndexAt(lvl, c)).toBe(1);
    expect(tileAt(lvl, c, p)).toBe(floor);
    expect(isWalkable(lvl, c, p)).toBe(true);
    expect(isTransparent(lvl, c, p)).toBe(true);
    // an untouched cell is wall (fail-closed)
    expect(isWalkable(lvl, levelCell(lvl, 0, 0), p)).toBe(false);
  });

  it('createLevel can fill with a non-zero default', () => {
    const p = palette();
    const lvl = createLevel('L', 3, 3, p.index('floor'));
    expect([...tilesLayer(lvl)].every((v) => v === 1)).toBe(true);
  });
});
