/**
 * dungeon — building, theming and populating the levels.
 *
 * `makeLevel` runs a biome's generator, repaints the floor/wall tiles to the
 * biome theme, places linked stairs, and scatters monsters + loot from the
 * biome's weighted tables. `levelProvider` is the hook the engine calls on
 * descent to build the next floor lazily; `spawnPlayer` drops the hero in.
 */
import {
  buildLevel,
  spawn,
  setTile,
  computeVisibility,
  deriveStat,
  reachableFrom,
  pick,
  pointOf,
  createEntity,
  type World,
  type Cell,
  type Entity,
  type LevelLink,
  type Level,
} from 'rlkit';
import { biomeForDepth, MAX_DEPTH, type Biome } from './biomes';

const WIDTH = 64;
const HEIGHT = 32;

interface BuiltGameLevel {
  level: Level;
  entrance: Cell;
  /** The up-stairs entity id (depth > 1), so the provider can link it back. */
  upStairsId?: string;
}

/** Mint a deterministic entity id, matching `spawn`'s convention. */
function mint(world: World): string {
  return `e${world.state.nextEntityId++}`;
}

/** Create a stairs entity (position + stairs) at a cell and index it. */
function placeStairs(world: World, levelId: string, cell: Cell, dir: 'up' | 'down', to?: LevelLink): string {
  const { x, y } = pointOf(cell, world.state.levels.get(levelId)!.width);
  const id = mint(world);
  const e = createEntity(id, [
    { type: 'position', x, y, levelId },
    { type: 'stairs', dir, ...(to ? { to } : {}) },
  ]);
  world.state.entities.set(id, e);
  world.services.queries.index(e);
  world.services.queries.place(id, levelId, cell);
  return id;
}

/** Build, theme, stair and populate the level at `depth`. */
export function makeLevel(world: World, depth: number): BuiltGameLevel {
  const biome = biomeForDepth(depth);
  const id = `depth-${depth}`;
  const built = buildLevel(world, { generator: biome.generator, width: WIDTH, height: HEIGHT, id, depth });
  const { level, entrance } = built;
  const palette = world.services.tiles;
  const floorIdx = palette.index('floor');
  const wallIdx = palette.index('wall');
  const themeFloor = palette.index(biome.floorTile);
  const themeWall = palette.index(biome.wallTile);

  // Repaint the core floor/wall to the biome theme (stairs tiles untouched).
  const tiles = level.layers.get('tiles') as Uint16Array;
  for (let c = 0; c < tiles.length; c++) {
    if (tiles[c] === floorIdx) tiles[c] = themeFloor;
    else if (tiles[c] === wallIdx) tiles[c] = themeWall;
  }

  // Up-stairs at the entrance (every level below the first).
  let upStairsId: string | undefined;
  if (depth > 1) {
    setTile(level, entrance, palette.index('stairs_up'));
    upStairsId = placeStairs(world, id, entrance, 'up');
  }

  // Down-stairs (or, on the last floor, the boss instead).
  const exclude = new Set<Cell>([entrance, built.stairs]);
  if (depth < MAX_DEPTH) {
    placeStairs(world, id, built.stairs, 'down'); // links lazily on first use
  } else {
    setTile(level, built.stairs, themeFloor); // no exit; clear the '>' glyph
    const boss = spawn(world, 'forgemaster', { at: built.stairs, levelId: id });
    world.services.timeline.addActor(boss.id, deriveStat(boss, world, 'speed'));
  }

  placeDoors(world, level, themeFloor, exclude);
  populate(world, level, depth, entrance, exclude);
  return { level, entrance, upStairsId };
}

/** Drop a few closed doors at corridor chokepoints (a floor cell walled on one axis). */
function placeDoors(world: World, level: Level, themeFloor: number, exclude: Set<Cell>): void {
  const palette = world.services.tiles;
  const tiles = level.layers.get('tiles') as Uint16Array;
  const doorClosed = palette.index('door_closed');
  const blocks = (c: number): boolean => !palette.byIndex(tiles[c]!).walkable;
  const rng = world.services.rng;
  let placed = 0;
  for (let tries = 0; tries < 500 && placed < 6; tries++) {
    const x = 1 + rng.int(0, level.width - 3);
    const y = 1 + rng.int(0, level.height - 3);
    const c = y * level.width + x;
    if (tiles[c] !== themeFloor || exclude.has(c)) continue;
    const hCorridor = blocks(c - level.width) && blocks(c + level.width) && !blocks(c - 1) && !blocks(c + 1);
    const vCorridor = blocks(c - 1) && blocks(c + 1) && !blocks(c - level.width) && !blocks(c + level.width);
    if (hCorridor || vCorridor) {
      tiles[c] = doorClosed;
      placed++;
    }
  }
}

/** Scatter monsters and loot on reachable floor, away from stairs/occupied cells. */
export function populate(world: World, level: Level, depth: number, entrance: Cell, exclude: Set<Cell>): void {
  const biome: Biome = biomeForDepth(depth);
  const palette = world.services.tiles;
  const tiles = level.layers.get('tiles') as Uint16Array;
  const reachable = [...reachableFrom(tiles, level.width, level.height, entrance, (i) => palette.byIndex(i).walkable)];
  const rng = world.services.rng;
  const used = new Set<Cell>(exclude);

  const freeCell = (): Cell | undefined => {
    for (let tries = 0; tries < 40; tries++) {
      const cell = reachable[rng.int(0, reachable.length - 1)]!;
      if (used.has(cell)) continue;
      // Skip cells already holding an entity (keep one thing per cell at spawn).
      if ([...world.services.queries.at(cell, level.id)].length > 0) continue;
      used.add(cell);
      return cell;
    }
    return undefined;
  };

  for (let i = 0; i < biome.monsters; i++) {
    const at = freeCell();
    if (at === undefined) break;
    const m = spawn(world, pick(biome.enemies, rng), { at, levelId: level.id });
    world.services.timeline.addActor(m.id, deriveStat(m, world, 'speed'));
  }
  for (let i = 0; i < biome.loot; i++) {
    const at = freeCell();
    if (at === undefined) break;
    spawn(world, pick(biome.items, rng), { at, levelId: level.id });
  }
}

/**
 * The engine's level provider: build the floor on the far side of unlinked
 * stairs and link the new up-stairs back to where the actor came from.
 */
export function levelProvider(world: World, req: { depth: number; dir: 'up' | 'down'; from: LevelLink }): LevelLink | undefined {
  if (req.dir !== 'down' || req.depth > MAX_DEPTH) return undefined;
  const built = makeLevel(world, req.depth);
  if (built.upStairsId) {
    const stairs = world.state.entities.get(built.upStairsId)!;
    const comp = stairs.components.get('stairs') as { to?: LevelLink };
    comp.to = req.from; // ascending returns to the parent's down-stairs
  }
  return { levelId: built.level.id, cell: built.entrance };
}

/** Drop the player onto a level at the entrance and schedule + light them up. */
export function spawnPlayer(world: World, levelId: string, entrance: Cell): Entity {
  const player = spawn(world, 'player', { at: entrance, levelId });
  world.services.timeline.addActor(player.id, deriveStat(player, world, 'speed'));
  computeVisibility(world, player.id);
  return player;
}
