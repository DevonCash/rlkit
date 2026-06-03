/**
 * visibility — per-turn field of view over the level (§20.6).
 *
 * Single-POV: `computeVisibility` writes two Uint8 layers on the viewer's Level
 * — `visible` (cleared and recomputed each call) and `explored` (accumulated
 * forever). The render frame (M7) reads these; AI sight is separate (`hasLoS` +
 * range, not this layer). Sight radius comes from the `sight-radius` stat,
 * falling back to `config.fov.defaultRadius`. Driver-invoked each player turn;
 * tested directly here.
 */
import { get } from '../core/entity';
import type { Position } from '../core/component';
import type { Cell, Point } from '../core/coords';
import { cellOf, inBounds } from '../core/coords';
import { isTransparent, type Level } from '../core/level';
import type { World } from '../core/world';
import { deriveStat } from './stats';

export const VISIBLE_LAYER = 'visible';
export const EXPLORED_LAYER = 'explored';

function ensureU8(level: Level, name: string): Uint8Array {
  let layer = level.layers.get(name);
  if (!(layer instanceof Uint8Array) || layer.length !== level.width * level.height) {
    layer = new Uint8Array(level.width * level.height);
    level.layers.set(name, layer);
  }
  return layer;
}

/**
 * Recompute the viewer's FOV: clear `visible`, mark visible cells, and OR them
 * into `explored`. Returns the set of visible cells.
 */
export function computeVisibility(world: World, viewerId: string, radius?: number): Set<Cell> {
  const viewer = world.state.entities.get(viewerId);
  const pos = viewer && get<Position>(viewer, 'position');
  const level = pos && world.state.levels.get(pos.levelId);
  if (!viewer || !pos || !level) return new Set();

  const r = radius ?? (deriveStat(viewer, world, 'sight-radius') || world.services.config.fov.defaultRadius);
  const palette = world.services.tiles;
  const transparent = (p: Point): boolean =>
    inBounds(p, level.width, level.height) && isTransparent(level, cellOf(p, level.width), palette);

  const visibleLayer = ensureU8(level, VISIBLE_LAYER);
  const exploredLayer = ensureU8(level, EXPLORED_LAYER);
  visibleLayer.fill(0);

  const visible = world.services.fov.compute({ x: pos.x, y: pos.y }, r, transparent, level.width);
  for (const cell of visible) {
    visibleLayer[cell] = 1;
    exploredLayer[cell] = 1;
  }
  return visible;
}

export function isVisible(level: Level, cell: Cell): boolean {
  return (level.layers.get(VISIBLE_LAYER) as Uint8Array | undefined)?.[cell] === 1;
}

export function isExplored(level: Level, cell: Cell): boolean {
  return (level.layers.get(EXPLORED_LAYER) as Uint8Array | undefined)?.[cell] === 1;
}
