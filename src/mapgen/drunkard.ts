/**
 * drunkard — drunkard's-walk cavern generator (§8.2).
 *
 * Carve a winding cavern by random-walking from the center, turning floor under
 * the walker until a target coverage is reached (or a step cap, which bounds
 * termination). Each carved cell is orthogonally adjacent to an already-carved
 * one, so the result is 4-connected by construction — fully reachable without
 * any decorate connectors. Pure: one direction draw per step, drawn before the
 * bounds branch, so a seed reproduces the map exactly.
 *
 * Tile convention: index 0 = wall; the floor index comes from `params.floorIndex`.
 */
import { cellOf, DIRS4 } from '../core/coords';
import type { RNG } from '../core/rng';
import type { GenParams, GeneratedMap, MapGenerator } from './generator';

const WALL = 0;
/** Step-cap multiple of interior area when `maxSteps` is the auto sentinel (0). */
const STEP_CAP_FACTOR = 8;

export function generateDrunkard(params: GenParams, rng: RNG): GeneratedMap {
  const { width, height } = params;
  const floor = (params.floorIndex as number | undefined) ?? 1;
  const coverage = (params.coverage as number | undefined) ?? 0.4;
  const maxSteps = (params.maxSteps as number | undefined) ?? 0;

  const tiles = new Uint16Array(width * height).fill(WALL);

  // Carve-able interior is the 1-cell-border inset; clamp the start into it.
  const minX = 1;
  const minY = 1;
  const maxX = Math.max(1, width - 2);
  const maxY = Math.max(1, height - 2);
  let x = Math.min(maxX, Math.max(minX, width >> 1));
  let y = Math.min(maxY, Math.max(minY, height >> 1));

  const startCell = cellOf({ x, y }, width);
  tiles[startCell] = floor;
  let carved = 1;

  const interiorArea = Math.max(1, (width - 2) * (height - 2));
  const target = Math.min(interiorArea, Math.max(1, Math.floor(coverage * interiorArea)));
  const stepCap = maxSteps > 0 ? maxSteps : interiorArea * STEP_CAP_FACTOR;

  for (let steps = 0; carved < target && steps < stepCap; steps++) {
    // Draw first (stable order), then test bounds.
    const dir = DIRS4[rng.int(0, DIRS4.length - 1)]!;
    const nx = x + dir.x;
    const ny = y + dir.y;
    if (nx < minX || ny < minY || nx > maxX || ny > maxY) continue; // stay put at the edge
    x = nx;
    y = ny;
    const cell = y * width + x;
    if (tiles[cell] === WALL) {
      tiles[cell] = floor;
      carved++;
    }
  }

  return {
    width,
    height,
    tiles,
    spawnHints: [{ kind: 'entrance', cell: startCell }],
  };
}

export const drunkard: MapGenerator = {
  id: 'drunkard',
  generate: generateDrunkard,
};
