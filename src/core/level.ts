/**
 * level — the layered-grid level model (§8.1).
 *
 * A `Level` is one `Cell` space (`Cell = y*width+x`) with named typed-array
 * layers stacked over it ('tiles' → tile-registry ids, plus field/flag layers)
 * and a cell→occupants spatial index kept in sync as entities move.
 *
 * M1 defines the data shape only; the tile registry, generators, and the
 * decorate/reachability passes land in milestone 3 (§20.3).
 */
import type { Cell } from './coords';
import type { EntityId } from './entity';

export interface TileType {
  id: string; // 'wall', 'floor', 'door', 'water'
  walkable: boolean;
  transparent: boolean; // for FOV
  glyph: string;
  fg: string;
  bg?: string;
  tags?: string[]; // 'liquid', 'hazard'
}

/** A grid layer: tiles (Uint16 → tile registry), fields (Float32), flags (Uint8). */
export type Layer = Uint16Array | Float32Array | Uint8Array;

export interface Level {
  id: string;
  width: number;
  height: number;
  layers: Map<string, Layer>;
  entityIndex: Map<Cell, EntityId[]>;
  metadata: Record<string, unknown>;
}
