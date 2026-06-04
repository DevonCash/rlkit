/**
 * biomes — the themed levels of the dungeon, as data.
 *
 * Each biome pairs a map generator with a visual theme (floor/wall tile ids the
 * dungeon builder remaps onto) and weighted spawn tables for its monsters and
 * loot. Depth selects the biome; the deepest level holds the boss.
 */
import type { WeightedTable } from 'rlkit';

/** The lowest depth — the Forgemaster's floor. A run is depths 1..MAX_DEPTH. */
export const MAX_DEPTH = 8;

export interface Biome {
  readonly name: string;
  readonly generator: 'cellular' | 'bsp' | 'drunkard' | 'prefab';
  /** Themed tile ids the builder swaps core floor/wall for (registered in content.ts). */
  readonly floorTile: string;
  readonly wallTile: string;
  /** How many monsters / loot items to scatter on a freshly built level. */
  readonly monsters: number;
  readonly loot: number;
  readonly enemies: WeightedTable<string>;
  readonly items: WeightedTable<string>;
}

const tbl = <T>(...entries: [T, number][]): WeightedTable<T> => ({
  entries: entries.map(([value, weight]) => ({ value, weight })),
});

const CAVES: Biome = {
  name: 'Mossy Caves',
  generator: 'cellular',
  floorTile: 'cave_floor',
  wallTile: 'cave_wall',
  monsters: 8,
  loot: 4,
  enemies: tbl(['rat', 5], ['bat', 4], ['spider', 3], ['goblin', 3]),
  items: tbl(['potion_heal', 5], ['dagger', 3], ['leather', 3], ['scroll_blink', 2], ['short_sword', 1]),
};

const CRYPT: Biome = {
  name: 'The Crypt',
  generator: 'bsp',
  floorTile: 'crypt_floor',
  wallTile: 'crypt_wall',
  monsters: 9,
  loot: 4,
  enemies: tbl(['skeleton', 5], ['zombie', 4], ['ghoul', 3], ['wraith', 2]),
  items: tbl(['potion_heal', 4], ['antidote', 3], ['short_sword', 3], ['chain', 3], ['scroll_haste', 2], ['mace', 1]),
};

const SEWERS: Biome = {
  name: 'Flooded Sewers',
  generator: 'drunkard',
  floorTile: 'sewer_floor',
  wallTile: 'sewer_wall',
  monsters: 10,
  loot: 5,
  enemies: tbl(['slime', 5], ['plague_zombie', 4], ['croc', 2]),
  items: tbl(['potion_heal', 3], ['potion_greater', 2], ['antidote', 3], ['mace', 2], ['chain', 2], ['scroll_fire', 2], ['ring_vigor', 1]),
};

const FOUNDRY: Biome = {
  name: 'The Foundry',
  generator: 'bsp',
  floorTile: 'foundry_floor',
  wallTile: 'foundry_wall',
  monsters: 10,
  loot: 5,
  enemies: tbl(['fire_beetle', 5], ['hellhound', 4], ['iron_golem', 3]),
  items: tbl(['potion_greater', 3], ['scroll_fire', 2], ['warhammer', 2], ['plate', 2], ['ring_vigor', 2], ['scroll_haste', 1]),
};

/** Depth → biome. Two levels per biome; the last level adds the boss (dungeon.ts). */
export function biomeForDepth(depth: number): Biome {
  if (depth <= 2) return CAVES;
  if (depth <= 4) return CRYPT;
  if (depth <= 6) return SEWERS;
  return FOUNDRY;
}
