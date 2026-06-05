/**
 * world — builds the shared dungeon for the authoritative server. Imports the
 * engine by relative path so node (tsx) resolves it without the vite `rlkit`
 * alias. Mirrors the in-process co-op world, minus any rendering.
 */
import {
  createWorld,
  defaultConfig,
  buildLevel,
  createEntity,
  reachableFrom,
  pointOf,
  type Config,
  type World,
  type EntityId,
  type Stance,
} from '../../../src/index';

export const VIEWPORT = { width: 56, height: 30 };

const config: Config = {
  ...defaultConfig,
  factions: { default: 'neutral' as Stance, matrix: { monster: { player: 'hostile' }, player: { monster: 'hostile' } } },
};

const PLAYER_COLORS = ['#6cf', '#fc6', '#9f9', '#f9c'];

export function buildCoopWorld(seed: number): { world: World; spawnPlayer: (w: World) => EntityId } {
  const world = createWorld({ config, rng: seed });
  const built = buildLevel(world, { generator: 'bsp', width: 64, height: 40, depth: 1, id: 'L' });
  const level = built.level;
  const palette = world.services.tiles;
  const tiles = level.layers.get('tiles') as Uint16Array;
  const reachable = [...reachableFrom(tiles, level.width, level.height, built.entrance, (i) => palette.byIndex(i).walkable)];
  const rng = world.services.rng;

  const freeCell = (): number => {
    for (let t = 0; t < 80; t++) {
      const c = reachable[rng.int(0, reachable.length - 1)]!;
      if ([...world.services.queries.at(c, level.id)].length === 0) return c;
    }
    return built.entrance;
  };

  let nextMon = 0;
  const spawnMonster = (): void => {
    const id = `mon-${nextMon++}`;
    const cell = freeCell();
    const { x, y } = pointOf(cell, level.width);
    const e = createEntity(
      id,
      [
        { type: 'position', x, y, levelId: level.id },
        { type: 'renderable', glyph: 'g', fg: '#6c6', layer: 5 },
        { type: 'info', name: 'Goblin' },
        { type: 'allegiance', faction: 'monster' },
        { type: 'stats', base: { 'max-hp': 8, attack: 2 } },
        { type: 'resources', pools: { hp: { current: 8 } } },
      ],
      ['aiHunter', 'aiWanderer'],
    );
    world.state.entities.set(id, e);
    world.services.queries.index(e);
    world.services.queries.place(id, level.id, cell);
    world.services.timeline.addActor(id, 10);
  };

  let joined = 0;
  const spawnPlayer = (w: World): EntityId => {
    const n = joined++;
    const id = `player-${n}`;
    const cell = freeCell();
    const { x, y } = pointOf(cell, level.width);
    const e = createEntity(id, [
      { type: 'position', x, y, levelId: level.id },
      { type: 'renderable', glyph: '@', fg: PLAYER_COLORS[n % PLAYER_COLORS.length], layer: 10 },
      { type: 'info', name: `Player ${n + 1}` },
      { type: 'allegiance', faction: 'player' },
      { type: 'stats', base: { 'max-hp': 30, attack: 5, defense: 1, speed: 10, 'sight-radius': 8 } },
      { type: 'resources', pools: { hp: { current: 30 } } },
    ]);
    w.state.entities.set(id, e);
    w.services.queries.index(e);
    w.services.queries.place(id, level.id, cell);
    w.services.timeline.addActor(id, 10);
    return id;
  };

  for (let i = 0; i < 10; i++) spawnMonster();
  return { world, spawnPlayer };
}
