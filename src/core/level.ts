/**
 * level — the layered-grid level model (§8.1).
 *
 * A `Level` is one `Cell` space (`Cell = y*width+x`) with named typed-array
 * layers stacked over it ('tiles' → tile-palette indices, plus field/flag
 * layers) and a cell→occupants spatial index.
 *
 * Note (§8.1 reconciliation, M3): `entityIndex` is the *serializable* occupant
 * map. At runtime the authoritative spatial index is `QueryIndex` (M1);
 * `entityIndex` is a save-time projection rebuilt in M9 and is left empty here.
 */
import type { Cell } from './coords';
import { cellOf } from './coords';
import type { EntityId } from './entity';
import type { TilePalette } from './tiles';

export interface TileType {
  id: string; // 'wall', 'floor', 'door', 'water'
  walkable: boolean;
  transparent: boolean; // for FOV
  glyph: string;
  fg: string;
  bg?: string;
  tags?: string[]; // 'liquid', 'hazard'
}

/** A grid layer: tiles (Uint16 → tile palette), fields (Float32), flags (Uint8). */
export type Layer = Uint16Array | Float32Array | Uint8Array;

export interface Level {
  id: string;
  width: number;
  height: number;
  layers: Map<string, Layer>;
  entityIndex: Map<Cell, EntityId[]>;
  metadata: Record<string, unknown>;
}

/** The canonical tiles layer name. */
export const TILES_LAYER = 'tiles';

/**
 * Create a level with a `'tiles'` Uint16 layer filled with `fill` (default 0 =
 * wall, fail-closed). `entityIndex`/`metadata` start empty.
 */
export function createLevel(id: string, width: number, height: number, fill = 0): Level {
  const tiles = new Uint16Array(width * height);
  if (fill !== 0) tiles.fill(fill);
  const layers = new Map<string, Layer>([[TILES_LAYER, tiles]]);
  return { id, width, height, layers, entityIndex: new Map(), metadata: {} };
}

/** The tiles layer of a level (throws if absent). */
export function tilesLayer(level: Level): Uint16Array {
  const layer = level.layers.get(TILES_LAYER);
  if (!(layer instanceof Uint16Array)) {
    throw new Error(`Level "${level.id}" has no Uint16 tiles layer`);
  }
  return layer;
}

/** The tile-palette index at a cell. */
export function tileIndexAt(level: Level, cell: Cell): number {
  return tilesLayer(level)[cell]!;
}

/** The `TileType` at a cell, resolved through the palette. */
export function tileAt(level: Level, cell: Cell, palette: TilePalette): TileType {
  return palette.byIndex(tileIndexAt(level, cell));
}

/** Write a tile-palette index at a cell. */
export function setTile(level: Level, cell: Cell, index: number): void {
  tilesLayer(level)[cell] = index;
}

export function isWalkable(level: Level, cell: Cell, palette: TilePalette): boolean {
  return palette.byIndex(tilesLayer(level)[cell]!).walkable;
}

export function isTransparent(level: Level, cell: Cell, palette: TilePalette): boolean {
  return palette.byIndex(tilesLayer(level)[cell]!).transparent;
}

/** Pack a point into this level's cell space. */
export function levelCell(level: Level, x: number, y: number): Cell {
  return cellOf({ x, y }, level.width);
}
