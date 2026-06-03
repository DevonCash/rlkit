/**
 * cellular — cellular-automata cave generator (§8.2).
 *
 * Random-fill the interior, then smooth with a majority rule until walls
 * coalesce into organic caverns. Pure: the only randomness is one `rng.next()`
 * per interior cell during the fill (fixed, row-major draw order), so a seed
 * reproduces the map exactly. Disconnected caves are fine — `decorate`'s
 * mutate-to-connect pass links them, so every seed yields a reachable level.
 *
 * Tile convention: index 0 = wall; the floor index comes from `params.floorIndex`.
 */
import { cellOf } from '../core/coords';
import type { RNG } from '../core/rng';
import type { GenParams, GeneratedMap, MapGenerator } from './generator';

const WALL = 0;

/** The 8-neighborhood deltas (out-of-bounds counts as wall in the smoothing rule). */
const D8: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function isBorder(x: number, y: number, width: number, height: number): boolean {
  return x === 0 || y === 0 || x === width - 1 || y === height - 1;
}

export function generateCellular(params: GenParams, rng: RNG): GeneratedMap {
  const { width, height } = params;
  const floor = (params.floorIndex as number | undefined) ?? 1;
  const wallProb = (params.wallProb as number | undefined) ?? 0.45;
  const iterations = (params.iterations as number | undefined) ?? 4;
  const threshold = (params.threshold as number | undefined) ?? 5;

  // 1. Random fill — border forced wall; one RNG draw per interior cell so the
  //    draw count depends only on area (deterministic), not on outcomes.
  let tiles = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = y * width + x;
      if (isBorder(x, y, width, height)) {
        tiles[cell] = WALL;
        continue;
      }
      tiles[cell] = rng.next() < wallProb ? WALL : floor;
    }
  }

  // 2. Smoothing — double-buffered so we never read a half-mutated grid. A cell
  //    becomes wall when its 8-neighbor wall count meets the threshold; OOB
  //    neighbors count as wall (border pressure). No RNG draws here.
  for (let it = 0; it < iterations; it++) {
    const next = new Uint16Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = y * width + x;
        if (isBorder(x, y, width, height)) {
          next[cell] = WALL;
          continue;
        }
        let walls = 0;
        for (const [dx, dy] of D8) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || tiles[ny * width + nx] === WALL) {
            walls++;
          }
        }
        next[cell] = walls >= threshold ? WALL : floor;
      }
    }
    tiles = next;
  }

  // 3. Entrance — first walkable cell; if the cave filled solid, carve the
  //    center so there is always a walkable seed for decorate.
  let entrance = -1;
  for (let c = 0; c < tiles.length; c++) {
    if (tiles[c] !== WALL) {
      entrance = c;
      break;
    }
  }
  if (entrance < 0) {
    entrance = cellOf({ x: width >> 1, y: height >> 1 }, width);
    tiles[entrance] = floor;
  }

  return {
    width,
    height,
    tiles,
    spawnHints: [{ kind: 'entrance', cell: entrance }],
  };
}

export const cellular: MapGenerator = {
  id: 'cellular',
  generate: generateCellular,
};
