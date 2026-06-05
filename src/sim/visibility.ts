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

/** Per-viewer layer names: `visible:<id>` / `explored:<id>` (hidden-info). */
export const visibleLayerFor = (viewerId: string): string => `${VISIBLE_LAYER}:${viewerId}`;
export const exploredLayerFor = (viewerId: string): string => `${EXPLORED_LAYER}:${viewerId}`;

/** Compute a viewer's FOV into named `visible`/`explored` layers. */
function computeInto(world: World, viewerId: string, radius: number | undefined, visName: string, expName: string): Set<Cell> {
  const viewer = world.state.entities.get(viewerId);
  const pos = viewer && get<Position>(viewer, 'position');
  const level = pos && world.state.levels.get(pos.levelId);
  if (!viewer || !pos || !level) return new Set();

  const r = radius ?? (deriveStat(viewer, world, 'sight-radius') || world.services.config.fov.defaultRadius);
  const palette = world.services.tiles;
  const transparent = (p: Point): boolean =>
    inBounds(p, level.width, level.height) && isTransparent(level, cellOf(p, level.width), palette);

  const visibleLayer = ensureU8(level, visName);
  const exploredLayer = ensureU8(level, expName);
  visibleLayer.fill(0);

  const visible = world.services.fov.compute({ x: pos.x, y: pos.y }, r, transparent, level.width);
  for (const cell of visible) {
    visibleLayer[cell] = 1;
    exploredLayer[cell] = 1;
  }
  return visible;
}

/**
 * Recompute the viewer's FOV into the SHARED `visible`/`explored` layers
 * (single-player / shared co-op fog). Clears `visible`, marks visible cells, and
 * OR's them into `explored`. Returns the set of visible cells.
 */
export function computeVisibility(world: World, viewerId: string, radius?: number): Set<Cell> {
  return computeInto(world, viewerId, radius, VISIBLE_LAYER, EXPLORED_LAYER);
}

/**
 * Hidden-info: recompute the viewer's FOV into its OWN per-viewer layers
 * (`visible:<id>` / `explored:<id>`), so each player keeps private visibility and
 * persistent explored memory. Render that player with `buildFrame`'s
 * `visibleLayer`/`exploredLayer` options; entities outside their FOV are hidden.
 */
export function computeVisibilityFor(world: World, viewerId: string, radius?: number): Set<Cell> {
  return computeInto(world, viewerId, radius, visibleLayerFor(viewerId), exploredLayerFor(viewerId));
}

/**
 * Shared (co-op) FOV: a level's `visible` becomes the UNION of every viewer
 * standing on it, with each viewer's cells also OR'd into `explored`. Viewers are
 * grouped by level, each level cleared once then accumulated, so two players on
 * one floor see one combined fog — no per-player layers, no render/log refactor.
 * The single-viewer `computeVisibility` is unchanged (single-player keeps using it).
 */
export function computeVisibilityUnion(world: World, viewerIds: readonly string[]): void {
  const byLevel = new Map<string, string[]>();
  for (const id of viewerIds) {
    const e = world.state.entities.get(id);
    const pos = e && get<Position>(e, 'position');
    if (!pos) continue;
    let ids = byLevel.get(pos.levelId);
    if (!ids) byLevel.set(pos.levelId, (ids = []));
    ids.push(id);
  }

  const palette = world.services.tiles;
  for (const [levelId, ids] of byLevel) {
    const level = world.state.levels.get(levelId);
    if (!level) continue;
    const visibleLayer = ensureU8(level, VISIBLE_LAYER);
    const exploredLayer = ensureU8(level, EXPLORED_LAYER);
    visibleLayer.fill(0);
    const transparent = (p: Point): boolean =>
      inBounds(p, level.width, level.height) && isTransparent(level, cellOf(p, level.width), palette);
    for (const id of ids) {
      const pos = get<Position>(world.state.entities.get(id)!, 'position')!;
      const r = deriveStat(world.state.entities.get(id)!, world, 'sight-radius') || world.services.config.fov.defaultRadius;
      for (const cell of world.services.fov.compute({ x: pos.x, y: pos.y }, r, transparent, level.width)) {
        visibleLayer[cell] = 1;
        exploredLayer[cell] = 1;
      }
    }
  }
}

export function isVisible(level: Level, cell: Cell): boolean {
  return (level.layers.get(VISIBLE_LAYER) as Uint8Array | undefined)?.[cell] === 1;
}

export function isExplored(level: Level, cell: Cell): boolean {
  return (level.layers.get(EXPLORED_LAYER) as Uint8Array | undefined)?.[cell] === 1;
}
