/**
 * graph — pure grid-connectivity kernels (§8.1).
 *
 * Flood fill and connected-component labeling over a packed-cell grid, behind a
 * `member` predicate. Lives in `core` (depends only on `coords`) so both
 * `mapgen` (reachability) and `sim` (the network index, §6) can depend downward
 * on it instead of one importing the other.
 */
import type { Cell } from './coords';
import { neighbors4, neighbors8 } from './coords';

/** Cells reachable from `start` over `member` cells (4- or 8-connected). */
export function reachable(
  start: Cell,
  width: number,
  height: number,
  member: (cell: Cell) => boolean,
  diagonals = false,
): Set<Cell> {
  const seen = new Set<Cell>();
  if (!member(start)) return seen;
  const neighbors = diagonals ? neighbors8 : neighbors4;
  const stack: Cell[] = [start];
  seen.add(start);
  while (stack.length > 0) {
    const c = stack.pop()!;
    for (const nb of neighbors(c, width, height)) {
      if (!seen.has(nb) && member(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  return seen;
}

/**
 * Label every `member` cell with its connected-component representative — the
 * **minimum cell index** in that component — and every non-member cell with -1.
 *
 * The representative is min-by-construction: cells are scanned in ascending
 * index and a new flood begins only at an unlabeled member cell, so the seed of
 * each component is necessarily its smallest-index cell. This makes the labeling
 * a pure function of the membership state — stable across save/load with nothing
 * persisted (§6, the network index relies on this).
 */
export function labelComponents(
  width: number,
  height: number,
  n: number,
  member: (cell: Cell) => boolean,
  diagonals = false,
): Int32Array {
  const labels = new Int32Array(n).fill(-1);
  const neighbors = diagonals ? neighbors8 : neighbors4;
  const stack: Cell[] = [];
  for (let start = 0; start < n; start++) {
    if (labels[start] !== -1 || !member(start)) continue;
    labels[start] = start; // the seed is this component's min cell → its rep
    stack.length = 0;
    stack.push(start);
    while (stack.length > 0) {
      const c = stack.pop()!;
      for (const nb of neighbors(c, width, height)) {
        if (labels[nb] === -1 && member(nb)) {
          labels[nb] = start;
          stack.push(nb);
        }
      }
    }
  }
  return labels;
}
