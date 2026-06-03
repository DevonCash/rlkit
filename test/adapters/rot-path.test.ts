import { describe, it, expect } from 'vitest';
import { makeRotPath } from '../../src/adapters/rot-path';
import type { Point } from '../../src/core/coords';

// rotJS Dijkstra floods all passable cells, so bound passability to a small box
// (mirrors a real Level's bounds) or the search never terminates.
const inBox = (p: Point) => p.x >= 0 && p.x <= 6 && p.y >= 0 && p.y <= 4;

describe('rot-path adapter', () => {
  it('returns a path whose first step is the origin and last is the target', () => {
    const path = makeRotPath({ topology: 4 });
    const result = path.path({ x: 0, y: 0 }, { x: 3, y: 0 }, inBox);
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result.at(-1)).toEqual({ x: 3, y: 0 });
    expect(result.length).toBe(4); // straight line, 4 cells
  });

  it('routes around an impassable wall', () => {
    // Wall column at x=2 except a gap at y=0; path from (1,1) to (3,1) must detour.
    const isPassable = (p: Point) => inBox(p) && !(p.x === 2 && p.y !== 0);
    const path = makeRotPath({ topology: 4 });
    const result = path.path({ x: 1, y: 1 }, { x: 3, y: 1 }, isPassable);
    expect(result.at(-1)).toEqual({ x: 3, y: 1 });
    expect(result).toContainEqual({ x: 2, y: 0 }); // through the gap
  });

  it('returns an empty path when the target is walled off', () => {
    // A full wall column at x=4 separates the target at (5,2) from the origin.
    const isPassable = (p: Point) => inBox(p) && p.x !== 4;
    const path = makeRotPath({ topology: 4 });
    const result = path.path({ x: 0, y: 2 }, { x: 5, y: 2 }, isPassable);
    expect(result).toEqual([]);
  });
});
