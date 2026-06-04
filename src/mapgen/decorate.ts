/**
 * decorate — post-generation pass (§8.2): guarantee reachability + place stairs.
 *
 * Connectivity is mutate-to-connect: flood from the entrance and carve connector
 * corridors to any stranded walkable region, so EVERY seed yields a fully
 * reachable level (§22.10a). Then place a `stairs_down` tile on the reachable
 * cell farthest from the entrance. The shipped BSP is already connected, so the
 * connector is a safety net for other/buggy generators.
 */
import type { Cell } from '../core/coords';
import { pointOf } from '../core/coords';
import type { GeneratedMap, SpawnHint } from './generator';
import { reachableFrom, walkableCells } from './reachability';

export interface DecorateOptions {
  floorIndex: number;
  stairsIndex: number;
  isWalkableIndex: (index: number) => boolean;
}

function manhattan(a: Cell, b: Cell, width: number): number {
  const pa = pointOf(a, width);
  const pb = pointOf(b, width);
  return Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y);
}

/** Carve an L-shaped floor corridor between two cells (horizontal then vertical). */
function carveCorridor(
  tiles: Uint16Array,
  width: number,
  a: Cell,
  b: Cell,
  floor: number,
): void {
  const pa = pointOf(a, width);
  const pb = pointOf(b, width);
  for (let x = Math.min(pa.x, pb.x); x <= Math.max(pa.x, pb.x); x++) {
    tiles[pa.y * width + x] = floor;
  }
  for (let y = Math.min(pa.y, pb.y); y <= Math.max(pa.y, pb.y); y++) {
    tiles[y * width + pb.x] = floor;
  }
}

/** The entrance cell from the map's spawn hints (defaults to cell 0). */
export function entranceOf(map: GeneratedMap): Cell {
  return map.spawnHints?.find((h) => h.kind === 'entrance')?.cell ?? 0;
}

/**
 * Mutate `map.tiles` to guarantee full reachability from the entrance and place
 * a reachable `stairs_down` tile. Returns the map with stairs added to
 * `spawnHints`.
 */
export function decorate(map: GeneratedMap, opts: DecorateOptions): GeneratedMap {
  const { tiles, width, height } = map;
  const { floorIndex, stairsIndex, isWalkableIndex } = opts;
  const entrance = entranceOf(map);

  // Ensure the entrance itself is walkable.
  if (!isWalkableIndex(tiles[entrance]!)) tiles[entrance] = floorIndex;

  // Mutate-to-connect: link every stranded walkable region to the reachable set.
  let reachable = reachableFrom(tiles, width, height, entrance, isWalkableIndex);
  let all = walkableCells(tiles, isWalkableIndex);
  let guard = all.size + 1; // termination backstop
  while (reachable.size < all.size && guard-- > 0) {
    let stranded = -1;
    for (const c of all) {
      if (!reachable.has(c)) {
        stranded = c;
        break;
      }
    }
    if (stranded < 0) break;
    // Nearest reachable cell (deterministic: first-found wins ties).
    let best = entrance;
    let bestD = Infinity;
    for (const r of reachable) {
      const d = manhattan(r, stranded, width);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    carveCorridor(tiles, width, stranded, best, floorIndex);
    reachable = reachableFrom(tiles, width, height, entrance, isWalkableIndex);
    all = walkableCells(tiles, isWalkableIndex);
  }

  // Place stairs on the reachable cell farthest from the entrance — but never
  // ON the entrance (only falls back to it on a degenerate 1-cell level).
  let stairs = entrance;
  let far = -1;
  for (const c of reachable) {
    if (c === entrance) continue;
    const d = manhattan(c, entrance, width);
    if (d > far || (d === far && c < stairs)) {
      far = d;
      stairs = c;
    }
  }
  tiles[stairs] = stairsIndex;

  const hints: SpawnHint[] = [
    ...(map.spawnHints ?? []),
    { kind: 'stairs_down', cell: stairs },
  ];
  return { ...map, spawnHints: hints };
}
