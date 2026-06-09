/**
 * build-level — orchestrates generation into a registered Level (§8.2).
 *
 * Pick generator → run → decorate → write tiles into a new `Level` → register
 * it in `world.state.levels`. The generator runs on a FORKED RNG sub-stream so
 * map generation is reproducible regardless of other draws on the world RNG
 * (decision §21.4): the same world seed always builds the same level N.
 */
import type { Cell } from '../core/coords';
import { TILES_LAYER, createLevel, type Level } from '../core/level';
import type { World } from '../core/world';
import type { Config } from '../config/defaults';
import { generatorRegistryOf, type MapGenerator } from './generator';
import { decorate, entranceOf } from './decorate';

/**
 * Per-generator config knobs spread into `GenParams`. Each generator also
 * defaults its own knobs, so unknown ids (or content generators) just get
 * `floorIndex`; this only surfaces the engine's tunables (config vs logic).
 */
function configKnobsFor(id: string, config: Config): Record<string, unknown> {
  switch (id) {
    case 'bsp':
      return { minRoomSize: config.bsp.minRoomSize, maxDepth: config.bsp.maxDepth };
    case 'cellular':
      return {
        wallProb: config.cellular.wallProb,
        iterations: config.cellular.iterations,
        threshold: config.cellular.threshold,
      };
    case 'drunkard':
      return { coverage: config.drunkard.coverage, maxSteps: config.drunkard.maxSteps };
    default:
      return {};
  }
}

export interface BuildLevelParams {
  generator: string;
  width: number;
  height: number;
  /** Level id; defaults to `level-<n>`. */
  id?: string;
  depth?: number;
  /** Extra generator-specific knobs. */
  [key: string]: unknown;
}

export interface BuiltLevel {
  level: Level;
  entrance: Cell;
  stairs: Cell;
}

export function buildLevel(world: World, params: BuildLevelParams): BuiltLevel {
  const { tiles: palette } = world.services;
  const generators = generatorRegistryOf(world);
  const generator: MapGenerator = generators.get(params.generator);

  const floorIndex = palette.index('floor');
  const stairsIndex = palette.index('stairs_down');

  // Forked sub-stream: isolated and reproducible per world seed.
  const rng = world.services.rng.fork();
  const knobs = configKnobsFor(params.generator, world.services.config);
  const raw = generator.generate({ ...params, floorIndex, ...knobs }, rng);
  const map = decorate(raw, {
    floorIndex,
    stairsIndex,
    isWalkableIndex: (i) => palette.byIndex(i).walkable,
  });

  const id = params.id ?? `level-${world.state.levels.size}`;
  const level = createLevel(id, map.width, map.height);
  level.layers.set(TILES_LAYER, map.tiles);
  if (params.depth !== undefined) level.metadata.depth = params.depth;
  world.state.levels.set(id, level);

  const entrance = entranceOf(map);
  const stairs = map.spawnHints?.find((h) => h.kind === 'stairs_down')?.cell ?? entrance;
  return { level, entrance, stairs };
}
