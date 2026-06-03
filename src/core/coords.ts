/**
 * coords — packed-integer cell coordinates (§8.1).
 *
 * `Cell = y*width + x` is the canonical id used by the tile grid, spatial
 * index, fields, and geometry: neighbors are pure offset arithmetic and there
 * is no per-cell string allocation in hot loops. `Point {x,y}` is the
 * ergonomic form at API edges; the `"x,y"` string exists only for debug/logs.
 *
 * Width is always supplied explicitly — a `Cell` is only meaningful relative to
 * the level width it was packed against.
 */

/** Canonical cell id within a level: `y*width + x`. */
export type Cell = number;

/** Ergonomic coordinate form used at API edges. */
export interface Point {
  x: number;
  y: number;
}

/** Pack a point into a cell for the given level width. */
export function cellOf(p: Point, width: number): Cell {
  return p.y * width + p.x;
}

/** Unpack a cell back into a point for the given level width. */
export function pointOf(c: Cell, width: number): Point {
  return { x: c % width, y: (c / width) | 0 };
}

/** Column (x) of a cell. */
export function xOf(c: Cell, width: number): number {
  return c % width;
}

/** Row (y) of a cell. */
export function yOf(c: Cell, width: number): number {
  return (c / width) | 0;
}

/** Whether a point lies within a `width`×`height` grid. */
export function inBounds(p: Point, width: number, height: number): boolean {
  return p.x >= 0 && p.x < width && p.y >= 0 && p.y < height;
}

/** Debug-only string form. Never use as a map key in hot paths — use `Cell`. */
export function keyOf(c: Cell, width: number): string {
  const p = pointOf(c, width);
  return `${p.x},${p.y}`;
}

/** Orthogonal steps (N, E, S, W) as point deltas. */
export const DIRS4: readonly Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** Orthogonal + diagonal steps (8 directions) as point deltas. */
export const DIRS8: readonly Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
];

function neighborsFrom(
  c: Cell,
  width: number,
  height: number,
  dirs: readonly Point[],
): Cell[] {
  const x = c % width;
  const y = (c / width) | 0;
  const out: Cell[] = [];
  for (const d of dirs) {
    const nx = x + d.x;
    const ny = y + d.y;
    // Bounds-check in (x,y) space so we never wrap across a row edge.
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
      out.push(ny * width + nx);
    }
  }
  return out;
}

/** Orthogonal in-bounds neighbors of a cell (no row-edge wrapping). */
export function neighbors4(c: Cell, width: number, height: number): Cell[] {
  return neighborsFrom(c, width, height, DIRS4);
}

/** Orthogonal + diagonal in-bounds neighbors of a cell (no wrapping). */
export function neighbors8(c: Cell, width: number, height: number): Cell[] {
  return neighborsFrom(c, width, height, DIRS8);
}
