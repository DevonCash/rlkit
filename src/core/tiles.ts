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
import { createFlagRegistry, type FlagRegistry } from './flags';

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
  /**
   * The composed flag bitmask for a tile index — `walkable`/`transparent` from
   * the booleans plus any named `flags`, resolved through the `FlagRegistry` at
   * registration time (§8.1). The hot path for `isWalkable`/`isTransparent` and
   * the source of the tile portion of the composed `flags` layer.
   */
  flagBits(index: number): number;
  /** Bitmask of the `walkable` flag (cached). */
  readonly walkableMask: number;
  /** Bitmask of the `transparent` flag (cached). */
  readonly transparentMask: number;
}

/** Register a list of tile defs into a palette in order (first → index 0). */
export function registerCoreTiles(palette: TilePalette, tiles: readonly TileType[]): void {
  for (const t of tiles) palette.register(t);
}

/** Resolve a tile's booleans + named flags to a composed bitmask (throws on unknown flag). */
function tileFlagMask(tile: TileType, flags: FlagRegistry): number {
  let m = 0;
  if (tile.walkable) m |= 1 << flags.bit('walkable');
  if (tile.transparent) m |= 1 << flags.bit('transparent');
  if (tile.flags) for (const f of tile.flags) m |= 1 << flags.bit(f);
  return m;
}

export function createTilePalette(flags: FlagRegistry = createFlagRegistry()): TilePalette {
  const registry: Registry<TileType> = createRegistry<TileType>('tile');
  const order: string[] = []; // index → id
  const indexById = new Map<string, number>();
  const bits: number[] = []; // index → composed flag bitmask
  const walkableMask = 1 << flags.bit('walkable');
  const transparentMask = 1 << flags.bit('transparent');

  return {
    register(tile) {
      registry.register(tile.id, tile); // throws on duplicate id
      const i = order.length;
      order.push(tile.id);
      indexById.set(tile.id, i);
      bits.push(tileFlagMask(tile, flags)); // resolved now → flags must be registered first
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
    flagBits(i) {
      const m = bits[i];
      if (m === undefined) throw new Error(`TilePalette: index ${i} out of range`);
      return m;
    },
    walkableMask,
    transparentMask,
  };
}
