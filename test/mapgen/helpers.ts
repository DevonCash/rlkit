import { createTilePalette, type TilePalette } from '../../src/core/tiles';

/** A minimal wall/floor/stairs palette matching the index-0=wall convention. */
export function mapPalette(): TilePalette {
  const p = createTilePalette();
  p.register({ id: 'wall', walkable: false, transparent: false, glyph: '#', fg: '#888' }); // 0
  p.register({ id: 'floor', walkable: true, transparent: true, glyph: '.', fg: '#ccc' }); // 1
  p.register({ id: 'stairs_down', walkable: true, transparent: true, glyph: '>', fg: '#ff0' }); // 2
  return p;
}

export function isWalkableIndexOf(p: TilePalette): (i: number) => boolean {
  return (i) => p.byIndex(i).walkable;
}
