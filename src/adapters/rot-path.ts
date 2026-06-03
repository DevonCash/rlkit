/**
 * adapters/rot-path — pathfinding provider backed by rotJS (§11.1).
 *
 * One of only two files allowed to import rotJS. Wraps `ROT.Path.Dijkstra` /
 * `AStar`; returns the path from `from` to `to` (inclusive) as `Point[]`, or []
 * when unreachable.
 */
import { Path } from 'rot-js';
import type { PathProvider } from '../core/path';
import type { Point } from '../core/coords';

export interface RotPathOptions {
  algorithm?: 'dijkstra' | 'astar';
  topology?: 4 | 6 | 8;
}

export function makeRotPath(opts: RotPathOptions = {}): PathProvider {
  const topology = opts.topology ?? 8;
  return {
    path(from, to, isPassable) {
      const passable = (x: number, y: number): boolean => isPassable({ x, y });
      const finder =
        opts.algorithm === 'astar'
          ? new Path.AStar(to.x, to.y, passable, { topology })
          : new Path.Dijkstra(to.x, to.y, passable, { topology });
      const result: Point[] = [];
      finder.compute(from.x, from.y, (x: number, y: number) => {
        result.push({ x, y });
      });
      return result;
    },
  };
}
