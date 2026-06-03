/**
 * adapters/rot-fov — FOV provider backed by rotJS shadowcasting (§11.1).
 *
 * One of only two files allowed to import rotJS. Wraps
 * `ROT.FOV.PreciseShadowcasting` / `RecursiveShadowcasting` and packs visible
 * `(x,y)` into canonical `Cell` ids for the caller's Uint8 visibility layer.
 */
import { FOV } from 'rot-js';
import type { FovProvider } from '../core/fov';
import type { Cell } from '../core/coords';
import { cellOf } from '../core/coords';

export interface RotFovOptions {
  algorithm?: 'precise' | 'recursive';
  topology?: 4 | 6 | 8;
}

export function makeRotFov(opts: RotFovOptions = {}): FovProvider {
  const topology = opts.topology ?? 8;
  return {
    compute(origin, radius, isTransparent, width) {
      const lightPasses = (x: number, y: number): boolean => isTransparent({ x, y });
      const fov =
        opts.algorithm === 'recursive'
          ? new FOV.RecursiveShadowcasting(lightPasses, { topology })
          : new FOV.PreciseShadowcasting(lightPasses, { topology });
      const out = new Set<Cell>();
      fov.compute(origin.x, origin.y, radius, (x, y, _r, visibility) => {
        if (visibility > 0) out.add(cellOf({ x, y }, width));
      });
      return out;
    },
  };
}
