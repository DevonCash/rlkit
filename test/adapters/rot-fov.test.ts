import { describe, it, expect } from 'vitest';
import { makeRotFov } from '../../src/adapters/rot-fov';
import { cellOf, type Point } from '../../src/core/coords';

const WIDTH = 7;
// Out-of-bounds is opaque (as a real Level's transparency predicate would be),
// so FOV never explores negative/out-of-range coords that would alias under packing.
const inBox = (p: Point) => p.x >= 0 && p.x < WIDTH && p.y >= 0 && p.y < 5;

describe('rot-fov adapter', () => {
  it('returns visible cells (incl. origin) when everything is transparent', () => {
    const fov = makeRotFov();
    const visible = fov.compute({ x: 3, y: 2 }, 3, inBox, WIDTH);
    expect(visible.has(cellOf({ x: 3, y: 2 }, WIDTH))).toBe(true);
    expect(visible.has(cellOf({ x: 5, y: 2 }, WIDTH))).toBe(true); // within radius
  });

  it('an opaque wall occludes the cells directly behind it', () => {
    const isTransparent = (p: Point) => inBox(p) && p.x !== 2; // full wall column at x=2
    const fov = makeRotFov();
    const visible = fov.compute({ x: 1, y: 2 }, 6, isTransparent, WIDTH);
    expect(visible.has(cellOf({ x: 1, y: 2 }, WIDTH))).toBe(true); // origin
    expect(visible.has(cellOf({ x: 4, y: 2 }, WIDTH))).toBe(false); // behind the wall
    expect(visible.has(cellOf({ x: 5, y: 2 }, WIDTH))).toBe(false);
  });

  it('sees more cells without the wall than with it', () => {
    const fov = makeRotFov();
    const open = fov.compute({ x: 1, y: 2 }, 6, inBox, WIDTH);
    const blocked = fov.compute({ x: 1, y: 2 }, 6, (p: Point) => inBox(p) && p.x !== 2, WIDTH);
    expect(blocked.size).toBeLessThan(open.size);
  });
});
