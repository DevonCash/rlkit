import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/index';
import { computeVisibility, isVisible, isExplored } from '../../src/sim/visibility';
import { createLevel, setTile, levelCell, type Level } from '../../src/core/level';
import { createEntity, get } from '../../src/core/entity';
import type { Position } from '../../src/core/component';
import { defaultConfig } from '../../src/config/defaults';

const W = 9;
const H = 5;

function setup() {
  const w = createWorld({ config: defaultConfig, rng: 1 });
  const lvl = createLevel('L', W, H, 1); // all floor (index 1)
  w.state.levels.set('L', lvl);
  return { w, lvl };
}
function placeViewer(w: ReturnType<typeof setup>['w'], x: number, y: number) {
  const e = createEntity('eye', [{ type: 'position', x, y, levelId: 'L' }]);
  w.state.entities.set('eye', e);
  return e;
}
function wallColumn(lvl: Level, x: number) {
  for (let y = 0; y < H; y++) setTile(lvl, levelCell(lvl, x, y), 0); // wall (index 0)
}

describe('computeVisibility (§20.6)', () => {
  it('marks in-range cells visible and accumulates explored', () => {
    const { w, lvl } = setup();
    placeViewer(w, 1, 2);
    computeVisibility(w, 'eye');
    expect(isVisible(lvl, levelCell(lvl, 1, 2))).toBe(true); // origin
    expect(isVisible(lvl, levelCell(lvl, 3, 2))).toBe(true); // open floor in range
    expect(isExplored(lvl, levelCell(lvl, 3, 2))).toBe(true);
  });

  it('an opaque wall occludes cells behind it', () => {
    const { w, lvl } = setup();
    wallColumn(lvl, 3);
    placeViewer(w, 1, 2);
    computeVisibility(w, 'eye');
    expect(isVisible(lvl, levelCell(lvl, 2, 2))).toBe(true); // before wall
    expect(isVisible(lvl, levelCell(lvl, 5, 2))).toBe(false); // behind wall
  });

  it('explored persists after a cell leaves the visible set', () => {
    const { w, lvl } = setup();
    const eye = placeViewer(w, 1, 2);
    computeVisibility(w, 'eye', 3);
    const near = levelCell(lvl, 2, 2);
    expect(isVisible(lvl, near)).toBe(true);

    // Move the viewer out of range (radius 3) and recompute.
    get<Position>(eye, 'position')!.x = 8;
    computeVisibility(w, 'eye', 3);
    expect(isVisible(lvl, near)).toBe(false); // no longer in view
    expect(isExplored(lvl, near)).toBe(true); // but still remembered
  });
});
