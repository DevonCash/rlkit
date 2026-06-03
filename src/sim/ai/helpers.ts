/**
 * ai/helpers — steering helpers shared by the AI mixins (§11.2).
 *
 * `canSee` (range + line of sight), `pathToward` (one step via the PathProvider),
 * and `nearestHostile` (faction-aware target pick). These use the adapters
 * through the injected providers and reuse geometry/stats/factions — no rotJS
 * import here (sim may not).
 */
import { get, type Entity } from '../../core/entity';
import type { Position } from '../../core/component';
import type { Point } from '../../core/coords';
import { isWalkable, type Level } from '../../core/level';
import { hasLoS } from '../../core/geometry';
import { cellOf } from '../../core/coords';
import type { ReadonlyWorld } from '../../core/world';
import { deriveStat } from '../stats';
import { stanceBetween } from '../factions';

export function chebyshev(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function posOf(e: Entity): Position | undefined {
  return get<Position>(e, 'position');
}

/** Whether `viewer` can see `target`: same level, within sight radius, and LoS. */
export function canSee(world: ReadonlyWorld, viewer: Entity, target: Entity): boolean {
  const vp = posOf(viewer);
  const tp = posOf(target);
  if (!vp || !tp || vp.levelId !== tp.levelId) return false;
  const level = world.state.levels.get(vp.levelId);
  if (!level) return false;
  const radius = deriveStat(viewer, world, 'sight-radius') || world.services.config.fov.defaultRadius;
  if (chebyshev(vp, tp) > radius) return false;
  return hasLoS(level, { x: vp.x, y: vp.y }, { x: tp.x, y: tp.y }, world.services.tiles);
}

/** The unit step from `from` toward `to` along a path, or undefined if none. */
export function pathToward(world: ReadonlyWorld, level: Level, from: Point, to: Point): Point | undefined {
  const palette = world.services.tiles;
  const isPassable = (p: Point): boolean =>
    p.x >= 0 && p.x < level.width && p.y >= 0 && p.y < level.height &&
    isWalkable(level, cellOf(p, level.width), palette);
  const path = world.services.path.path(from, to, isPassable);
  const next = path[1]; // path[0] is `from`
  if (!next) return undefined;
  return { x: Math.sign(next.x - from.x), y: Math.sign(next.y - from.y) };
}

/** The nearest entity `self` regards as hostile and can currently see. */
export function nearestHostile(world: ReadonlyWorld, self: Entity): Entity | undefined {
  const sp = posOf(self);
  if (!sp) return undefined;
  let best: Entity | undefined;
  let bestDist = Infinity;
  for (const other of world.services.queries.with('position', 'allegiance')) {
    if (other.id === self.id) continue;
    const op = posOf(other);
    if (!op || op.levelId !== sp.levelId) continue;
    if (stanceBetween(world, self, other) !== 'hostile') continue;
    if (!canSee(world, self, other)) continue;
    const d = chebyshev(sp, op);
    if (d < bestDist) {
      bestDist = d;
      best = other;
    }
  }
  return best;
}
