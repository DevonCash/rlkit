/**
 * fov — the field-of-view provider interface (§11.1).
 *
 * rotJS lives behind this: the interface is in `core` so `sim` (visibility) can
 * consume it without importing `adapters`; the concrete shadowcasting impl is
 * in `adapters/rot-fov.ts`, injected at the edge (the RNG precedent).
 *
 * Returns packed `Cell` ids (not `"x,y"` strings) so the per-turn visibility
 * loop writes straight into the level's Uint8 layer with no string repacking
 * (§8.1 — packed integers are canonical). `width` is required to pack cells.
 */
import type { Cell, Point } from './coords';

export interface FovProvider {
  /** Visible cells from `origin` within `radius`, given a transparency test. */
  compute(
    origin: Point,
    radius: number,
    isTransparent: (p: Point) => boolean,
    width: number,
  ): Set<Cell>;
}
