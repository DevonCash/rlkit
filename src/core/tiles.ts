/**
 * tiles — the tile palette (§8.1).
 *
 * The grid stores small integer tile ids (a Uint16 `'tiles'` layer) for
 * compactness and fast save/load; `TileType` definitions live in a registry
 * keyed by string id. The palette bridges the two: it wraps a
 * `Registry<TileType>` (so by-id lookup + serialize-by-name hold — saves store
 * the string id, never the volatile int index) and layers an int↔id table on
 * top so the grid can use indices in hot loops.
 *
 * Convention: **index 0 is wall** (the first tile registered). `createLevel`
 * fills new grids with 0, so an ungenerated/buggy cell is solid rock — a
 * fail-closed default.
 */
import { createRegistry, type Registry } from './registry';
import type { TileType } from './level';

export interface TilePalette {
  /** Register a tile, assigning it the next integer index; returns that index. */
  register(tile: TileType): number;
  /** Integer index for a tile id (throws if unknown). */
  index(id: string): number;
  /** Tile def at an integer index (throws if out of range). */
  byIndex(i: number): TileType;
  /** Tile def by string id (throws if unknown). */
  byId(id: string): TileType;
  /** Non-throwing by-id lookup. */
  tryGet(id: string): TileType | undefined;
  has(id: string): boolean;
  /** Registered tile ids in index order. */
  ids(): string[];
  /** Number of registered tiles. */
  readonly size: number;
}

/** Register a list of tile defs into a palette in order (first → index 0). */
export function registerCoreTiles(palette: TilePalette, tiles: readonly TileType[]): void {
  for (const t of tiles) palette.register(t);
}

export function createTilePalette(): TilePalette {
  const registry: Registry<TileType> = createRegistry<TileType>('tile');
  const order: string[] = []; // index → id
  const indexById = new Map<string, number>();

  return {
    register(tile) {
      registry.register(tile.id, tile); // throws on duplicate id
      const i = order.length;
      order.push(tile.id);
      indexById.set(tile.id, i);
      return i;
    },
    index(id) {
      const i = indexById.get(id);
      if (i === undefined) throw new Error(`TilePalette: unknown tile id "${id}"`);
      return i;
    },
    byIndex(i) {
      const id = order[i];
      if (id === undefined) throw new Error(`TilePalette: index ${i} out of range`);
      return registry.get(id);
    },
    byId(id) {
      return registry.get(id);
    },
    tryGet(id) {
      return registry.tryGet(id);
    },
    has(id) {
      return registry.has(id);
    },
    ids() {
      return [...order];
    },
    get size() {
      return order.length;
    },
  };
}
