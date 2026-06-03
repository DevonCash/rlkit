/**
 * config/defaults — all default configurable values in one place (§17, §3).
 *
 * Per the config-vs-logic pillar, numbers, costs, colors, glyphs, speeds,
 * rates, and content tables live here (or in registries), never hardcoded in
 * rules. Values land with the systems that read them.
 */
import type { TileType } from '../core/level';
import type { Stance } from '../core/component';

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
  /** Equipment slot names (§10). */
  readonly equipment: { readonly slots: readonly string[] };
  /** Inventory limits (§10): default item-count cap + optional carry-weight cap. */
  readonly inventory: { readonly defaultCapacity: number; readonly maxCarryWeight?: number };
  /** Field of view (§11.1): default sight radius (overridden by a sight-radius stat). */
  readonly fov: { readonly defaultRadius: number };
  /** Faction stance matrix (§11A.2): default stance + per-faction overrides. */
  readonly factions: {
    readonly default: Stance;
    readonly matrix: Readonly<Record<string, Readonly<Record<string, Stance>>>>;
  };
  /** Field system tuning (§11.3): composite clamp, flee, scent, influence. */
  readonly fields: {
    readonly maxDistance: number;
    readonly fleeCoefficient: number;
    readonly scent: { readonly deposit: number; readonly decay: number; readonly diffusion: number };
    readonly influence: { readonly falloffRadius: number };
  };
  /** Render frame resolution (§13.1): dim factor for explored, blanks for unseen. */
  readonly render: {
    readonly dim: number;
    readonly defaultBg: string;
    readonly defaultFg: string;
    readonly emptyGlyph: string;
  };
  /** Message log (§12): event type → template string (payload interpolated). */
  readonly log: { readonly templates: Readonly<Record<string, string>> };
  /** Input keymap (§14): normalized key combo → command id (fully configurable). */
  readonly keymap: Readonly<Record<string, string>>;
  /** UI layout (§15): HUD + log-view sizing. */
  readonly ui: { readonly hud: { readonly enabled: boolean }; readonly log: { readonly height: number } };
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
  equipment: { slots: ['weapon', 'armor', 'ring'] },
  inventory: { defaultCapacity: 26 },
  fov: { defaultRadius: 8 },
  factions: { default: 'neutral', matrix: {} },
  fields: {
    maxDistance: 1000,
    fleeCoefficient: -1.2,
    scent: { deposit: 1, decay: 0.9, diffusion: 0.2 },
    influence: { falloffRadius: 6 },
  },
  render: { dim: 0.45, defaultBg: '#000', defaultFg: '#666', emptyGlyph: ' ' },
  log: {
    templates: {
      moved: '{entity} moves.',
      bumped: '{entity} bumps into something.',
      damaged: '{entity} takes {amount} damage.',
      died: '{entity} dies.',
    },
  },
  // vi-keys + arrows + numpad (NumLock digits). The 8 movement commands map to
  // DIRS8 directions in command-to-action.ts.
  keymap: {
    k: 'move-north', ArrowUp: 'move-north', '8': 'move-north',
    j: 'move-south', ArrowDown: 'move-south', '2': 'move-south',
    h: 'move-west', ArrowLeft: 'move-west', '4': 'move-west',
    l: 'move-east', ArrowRight: 'move-east', '6': 'move-east',
    y: 'move-nw', '7': 'move-nw',
    u: 'move-ne', '9': 'move-ne',
    b: 'move-sw', '1': 'move-sw',
    n: 'move-se', '3': 'move-se',
    '.': 'wait', '5': 'wait',
    i: 'open-inventory',
    g: 'pickup',
    f: 'open-targeting',
    Enter: 'confirm',
    Escape: 'cancel',
  },
  ui: { hud: { enabled: true }, log: { height: 5 } },
};
