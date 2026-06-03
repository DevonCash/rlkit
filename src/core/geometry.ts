/**
 * geometry — lines, line-of-sight, and AoE shapes (§11A.3).
 *
 * One set of primitives feeds both the targeting UI (preview) and effect
 * application (resolve over cells). Whether a shape is blocked by walls is a
 * per-use config knob (`opts.blocks`); the geometry itself is pure logic.
 *
 * `line`/`hasLoS` work in `Point` space (Bresenham is x/y arithmetic).
 * `cellsIn` returns `Point[]` at the edge but uses packed cells internally and
 * for the `blocks` predicate.
 */
import type { Point, Cell } from './coords';
import { cellOf } from './coords';
import type { Level } from './level';
import { isTransparent } from './level';
import type { TilePalette } from './tiles';

/** Bresenham line between two points, inclusive of both endpoints. */
export function line(a: Point, b: Point): Point[] {
  const points: Point[] = [];
  let x0 = a.x;
  let y0 = a.y;
  const x1 = b.x;
  const y1 = b.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    points.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  return points;
}

/**
 * Line of sight from `a` to `b`: clear unless an intermediate cell is opaque.
 * Endpoints are exempt (you can see the wall you're looking at, and out of your
 * own cell).
 */
export function hasLoS(level: Level, a: Point, b: Point, palette: TilePalette): boolean {
  const path = line(a, b);
  for (let i = 1; i < path.length - 1; i++) {
    const p = path[i]!;
    if (!isTransparent(level, cellOf(p, level.width), palette)) return false;
  }
  return true;
}

export type Shape =
  | { kind: 'blast'; radius: number }
  | { kind: 'cone'; dir: Point; angle: number; range: number }
  | { kind: 'beam'; dir: Point; range: number }
  | { kind: 'ring'; radius: number };

export interface CellsInOptions {
  width: number;
  height: number;
  /** Optional per-use occlusion: cells whose ray from origin is blocked are dropped. */
  blocks?: (cell: Cell) => boolean;
}

function inBoundsXY(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}

/** Whether `target` is visible from `origin` given a `blocks` predicate. */
function rayClear(origin: Point, target: Point, width: number, blocks: (cell: Cell) => boolean): boolean {
  const path = line(origin, target);
  for (let i = 1; i < path.length - 1; i++) {
    if (blocks(cellOf(path[i]!, width))) return false;
  }
  return true;
}

/** Cells covered by `shape` centered at `origin`, clipped to bounds (and LoS if `blocks`). */
export function cellsIn(origin: Point, shape: Shape, opts: CellsInOptions): Point[] {
  const { width, height, blocks } = opts;
  const out: Point[] = [];
  const push = (x: number, y: number): void => {
    if (!inBoundsXY(x, y, width, height)) return;
    if (blocks && !rayClear(origin, { x, y }, width, blocks)) return;
    out.push({ x, y });
  };

  switch (shape.kind) {
    case 'blast': {
      const r = shape.radius;
      const r2 = r * r;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy <= r2) push(origin.x + dx, origin.y + dy);
        }
      }
      break;
    }
    case 'ring': {
      const r = shape.radius;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.round(Math.sqrt(dx * dx + dy * dy)) === r) push(origin.x + dx, origin.y + dy);
        }
      }
      break;
    }
    case 'beam': {
      const len = Math.hypot(shape.dir.x, shape.dir.y) || 1;
      const ux = shape.dir.x / len;
      const uy = shape.dir.y / len;
      for (let step = 1; step <= shape.range; step++) {
        push(origin.x + Math.round(ux * step), origin.y + Math.round(uy * step));
      }
      break;
    }
    case 'cone': {
      const r = shape.range;
      const dlen = Math.hypot(shape.dir.x, shape.dir.y) || 1;
      const dux = shape.dir.x / dlen;
      const duy = shape.dir.y / dlen;
      const half = shape.angle / 2;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx === 0 && dy === 0) continue;
          const dist = Math.hypot(dx, dy);
          if (dist > r) continue;
          const dot = (dx * dux + dy * duy) / dist;
          const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
          if (ang <= half) push(origin.x + dx, origin.y + dy);
        }
      }
      break;
    }
  }
  return out;
}
