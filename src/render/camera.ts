/**
 * camera — viewport + camera resolution (§13.2).
 *
 * A small presentation utility: given a viewport size and a camera target
 * (a cell or an entity to follow), compute the top-left origin of the window in
 * level coordinates, centered on the target and clamped so the view never runs
 * off the level edge.
 */
import { get } from '../core/entity';
import type { EntityId } from '../core/entity';
import type { Position } from '../core/component';
import type { Cell, Point } from '../core/coords';
import { pointOf } from '../core/coords';
import type { Level } from '../core/level';
import type { ReadonlyWorld } from '../core/world';

export interface Viewport {
  width: number;
  height: number;
}

export interface Camera {
  /** A packed `Cell` to center on, or an `EntityId` to follow. */
  centerOn: Cell | EntityId;
  /** Required when `centerOn` is a Cell; derived from the entity otherwise. */
  levelId?: string;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** The level the camera looks at (the followed entity's level, or `camera.levelId`). */
export function cameraLevel(world: ReadonlyWorld, camera: Camera): Level | undefined {
  if (typeof camera.centerOn === 'string') {
    const e = world.state.entities.get(camera.centerOn);
    const pos = e && get<Position>(e, 'position');
    if (pos) return world.state.levels.get(pos.levelId);
  }
  return camera.levelId ? world.state.levels.get(camera.levelId) : undefined;
}

function cameraCenter(world: ReadonlyWorld, level: Level, camera: Camera): Point {
  if (typeof camera.centerOn === 'number') return pointOf(camera.centerOn, level.width);
  const e = world.state.entities.get(camera.centerOn);
  const pos = e && get<Position>(e, 'position');
  return pos ? { x: pos.x, y: pos.y } : { x: level.width >> 1, y: level.height >> 1 };
}

/** Top-left origin (level coords) of the viewport window, clamped to bounds. */
export function viewportOrigin(
  world: ReadonlyWorld,
  level: Level,
  viewport: Viewport,
  camera: Camera,
): Point {
  const c = cameraCenter(world, level, camera);
  return {
    x: clamp(c.x - (viewport.width >> 1), 0, Math.max(0, level.width - viewport.width)),
    y: clamp(c.y - (viewport.height >> 1), 0, Math.max(0, level.height - viewport.height)),
  };
}
