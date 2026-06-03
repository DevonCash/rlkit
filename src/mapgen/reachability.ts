/**
 * reachability — 4-connected flood fill over walkable cells (§22.10).
 *
 * Pure helper shared by the decorate pass and its tests. "Reachable" is defined
 * as 4-connected (`neighbors4`) over cells whose tile index is walkable,
 * starting from a single cell, occupant-agnostic.
 */
import type { Cell } from '../core/coords';
import { neighbors4 } from '../core/coords';

/** Cells reachable from `start` over walkable tiles (4-connected). */
export function reachableFrom(
  tiles: Uint16Array,
  width: number,
  height: number,
  start: Cell,
  isWalkableIndex: (index: number) => boolean,
): Set<Cell> {
  const seen = new Set<Cell>();
  if (!isWalkableIndex(tiles[start]!)) return seen;
  const stack: Cell[] = [start];
  seen.add(start);
  while (stack.length > 0) {
    const c = stack.pop()!;
    for (const n of neighbors4(c, width, height)) {
      if (!seen.has(n) && isWalkableIndex(tiles[n]!)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen;
}

/** All walkable cells in the grid (for connectivity comparisons). */
export function walkableCells(
  tiles: Uint16Array,
  isWalkableIndex: (index: number) => boolean,
): Set<Cell> {
  const out = new Set<Cell>();
  for (let c = 0; c < tiles.length; c++) {
    if (isWalkableIndex(tiles[c]!)) out.add(c);
  }
  return out;
}
