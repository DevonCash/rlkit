/**
 * config/defaults — all default configurable values in one place (§17, §3).
 *
 * Per the config-vs-logic pillar, numbers, costs, colors, glyphs, speeds,
 * rates, and content tables live here (or in registries), never hardcoded in
 * rules. Values land with the systems that read them.
 */
import type { TileType } from '../core/level';

export interface Config {
  /** turns → energy conversion helper baseline (decision §21.2). */
  readonly energyPerTurn: number;
  /** Default energy cost of an action (§7.1). */
  readonly baseActionCost: number;
  /** Energy an actor accrues per world tick when no per-actor speed is set (§7.1). */
  readonly defaultSpeed: number;
  /** Max reaction-loop drain iterations before the depth guard trips (§7.3). */
  readonly maxReactionDepth: number;
  /** Built-in tile definitions; index 0 (first) is wall by convention (§8.1). */
  readonly tiles: readonly TileType[];
  /** BSP generator defaults (§8.2). */
  readonly bsp: { readonly minRoomSize: number; readonly maxDepth: number };
  /** Default damage-formula coefficients (§9.3); the formula itself is logic. */
  readonly combat: { readonly minDamage: number; readonly variance: number };
}

export const defaultConfig: Config = {
  energyPerTurn: 100,
  baseActionCost: 100,
  defaultSpeed: 10,
  maxReactionDepth: 64,
  tiles: [
    { id: 'wall', walkable: false, transparent: false, glyph: '#', fg: '#666' },
    { id: 'floor', walkable: true, transparent: true, glyph: '.', fg: '#aaa' },
    { id: 'stairs_down', walkable: true, transparent: true, glyph: '>', fg: '#ff4', tags: ['stairs'] },
  ],
  bsp: { minRoomSize: 5, maxDepth: 5 },
  combat: { minDamage: 1, variance: 2 },
};
