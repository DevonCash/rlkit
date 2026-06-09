/**
 * generator — the map-generation interface (§8.2).
 *
 * A generator is a pure function of `(params, rng)` so a seed reproduces a map.
 * It emits a `GeneratedMap`: the raw tile grid (palette indices) plus optional
 * structural hints (rooms, connections, spawn points) for the decorate pass and
 * downstream placement. Generators live in a `Registry<MapGenerator>` and may
 * be supplied by content.
 */
import type { Cell } from '../core/coords';
import { createRegistry, type Registry } from '../core/registry';
import type { RNG } from '../core/rng';
import type { ReadonlyWorld } from '../core/world';

/** A rectangular region (e.g. a BSP room), in cell coordinates. */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An edge between two region indices (corridor / graph reasoning). */
export interface Edge {
  a: number;
  b: number;
}

/** A hint for downstream placement (entrance, stairs, monster, loot). */
export interface SpawnHint {
  kind: string; // 'entrance' | 'stairs_down' | ...
  cell: Cell;
}

export interface GenParams {
  width: number;
  height: number;
  depth?: number;
  /** Generator-specific knobs (min room size, etc.). */
  [key: string]: unknown;
}

export interface GeneratedMap {
  width: number;
  height: number;
  /** Tile palette indices, row-major (length === width*height). */
  tiles: Uint16Array;
  regions?: Region[];
  connections?: Edge[];
  spawnHints?: SpawnHint[];
}

export interface MapGenerator {
  id: string;
  generate(params: GenParams, rng: RNG): GeneratedMap;
}

export type GeneratorRegistry = Registry<MapGenerator>;

/** Typed view of the generator registry (centralizes the one downcast). */
export function generatorRegistryOf(world: ReadonlyWorld): GeneratorRegistry {
  return world.services.registries.generators as GeneratorRegistry;
}

export function createGeneratorRegistry(): GeneratorRegistry {
  return createRegistry<MapGenerator>('generator');
}
