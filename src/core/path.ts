/**
 * path — the point-to-point pathfinding provider interface (§11.1).
 *
 * rotJS Dijkstra/AStar lives behind this; impl in `adapters/rot-path.ts`,
 * injected at the edge. Fields (§11.3, M6b) supersede this for monster
 * navigation; the provider remains for one-off queries (auto-travel, a single
 * chase step). Returns `Point[]` — consumers want the next-step delta, and
 * paths are short, so the packed-`Cell` convention isn't needed here.
 */
import type { Point } from './coords';

export interface PathProvider {
  /** A path from `from` to `to` (inclusive) over passable cells, or [] if none. */
  path(from: Point, to: Point, isPassable: (p: Point) => boolean): Point[];
}
