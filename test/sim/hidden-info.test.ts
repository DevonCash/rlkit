import { describe, it, expect } from 'vitest';
import { createWorld, buildFrame, computeVisibilityFor, visibleLayerFor, exploredLayerFor, AsciiRenderer } from '../../src/index';
import { createLevel, levelCell, setTile, type Level } from '../../src/core/level';
import { createEntity } from '../../src/core/entity';
import { defaultConfig } from '../../src/config/defaults';

const W = 21;
const H = 7;

function setup() {
  // A corridor split by a wall pillar so two viewers see disjoint halves.
  const w = createWorld({ config: defaultConfig, rng: 1 });
  const lvl = createLevel('L', W, H, 1); // all floor
  // Wall the whole column x=10 to block line of sight between the two rooms.
  for (let y = 0; y < H; y++) setTile(lvl, levelCell(lvl, 10, y), 0);
  w.state.levels.set('L', lvl);
  return { w, lvl };
}
function place(w: ReturnType<typeof setup>['w'], lvl: Level, id: string, x: number, y: number, comps: { type: string; [k: string]: unknown }[] = []) {
  const e = createEntity(id, [{ type: 'position', x, y, levelId: 'L' }, ...comps]);
  w.state.entities.set(id, e);
  w.services.queries.index(e);
  w.services.queries.place(id, 'L', levelCell(lvl, x, y));
  return e;
}

describe('per-player FOV (hidden-info)', () => {
  it('gives each viewer their own visible set + persistent explored memory', () => {
    const { w, lvl } = setup();
    place(w, lvl, 'a', 3, 3);
    place(w, lvl, 'b', 17, 3);

    const visA = computeVisibilityFor(w, 'a');
    const visB = computeVisibilityFor(w, 'b');

    // A sees its own cell, not B's far cell across the wall — and vice-versa.
    expect(visA.has(levelCell(lvl, 3, 3))).toBe(true);
    expect(visA.has(levelCell(lvl, 17, 3))).toBe(false);
    expect(visB.has(levelCell(lvl, 17, 3))).toBe(true);
    expect(visB.has(levelCell(lvl, 3, 3))).toBe(false);

    // Stored in distinct per-viewer layers.
    expect(lvl.layers.has(visibleLayerFor('a'))).toBe(true);
    expect(lvl.layers.has(visibleLayerFor('b'))).toBe(true);
    const expA = lvl.layers.get(exploredLayerFor('a')) as Uint8Array;
    expect(expA[levelCell(lvl, 3, 3)]).toBe(1);
    expect(expA[levelCell(lvl, 17, 3)]).toBe(0); // A never explored B's area
  });

  it('buildFrame for one viewer hides an entity only the OTHER viewer can see', () => {
    const { w, lvl } = setup();
    const a = place(w, lvl, 'a', 3, 3, [{ type: 'renderable', glyph: '@', fg: '#fff', layer: 10 }]);
    place(w, lvl, 'secret', 17, 3, [{ type: 'renderable', glyph: 'M', fg: '#f00', layer: 5 }]); // near B, far from A
    computeVisibilityFor(w, 'a');

    const frame = buildFrame(w, { width: W, height: H }, { centerOn: a.id }, { visibleLayer: visibleLayerFor('a'), exploredLayer: exploredLayerFor('a') });
    const renderer = new AsciiRenderer();
    renderer.draw(frame);
    const text = renderer.toString();
    expect(text).toContain('@'); // A sees itself
    expect(text).not.toContain('M'); // A cannot see the monster across the wall
  });

  it('the default (no opts) buildFrame still renders the shared layers (single-player unchanged)', () => {
    const { w, lvl } = setup();
    const a = place(w, lvl, 'a', 3, 3, [{ type: 'renderable', glyph: '@', fg: '#fff', layer: 10 }]);
    // Mark the whole level visible on the SHARED layer (what single-player uses).
    lvl.layers.set('visible', new Uint8Array(W * H).fill(1));
    const renderer = new AsciiRenderer();
    renderer.draw(buildFrame(w, { width: W, height: H }, { centerOn: a.id }));
    expect(renderer.toString()).toContain('@');
  });
});
