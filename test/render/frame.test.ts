import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/index';
import { buildFrame, type RenderFrame } from '../../src/render/frame';
import { createLevel, setTile, levelCell, type Level } from '../../src/core/level';
import { VISIBLE_LAYER, EXPLORED_LAYER } from '../../src/sim/visibility';
import { createEntity } from '../../src/core/entity';
import { defaultConfig } from '../../src/config/defaults';
import type { Component } from '../../src/core/component';

const W = 8;
const H = 5;

function setup() {
  const w = createWorld({ config: defaultConfig, rng: 1 });
  const lvl = createLevel('L', W, H, 1); // all floor (glyph '.')
  w.state.levels.set('L', lvl);
  return { w, lvl };
}
function setVis(lvl: Level, layer: string, cells: number[]) {
  const a = new Uint8Array(W * H);
  for (const c of cells) a[c] = 1;
  lvl.layers.set(layer, a);
}
function place(w: ReturnType<typeof setup>['w'], id: string, x: number, y: number, extra: Component[]) {
  const e = createEntity(id, [{ type: 'position', x, y, levelId: 'L' }, ...extra]);
  w.state.entities.set(id, e);
  w.services.queries.index(e);
  w.services.queries.place(id, 'L', levelCell(w.state.levels.get('L')!, x, y));
}
const at = (frame: RenderFrame, x: number, y: number) => frame.cells[y * frame.width + x]!;

describe('buildFrame (§22.14)', () => {
  it('shows the top renderable (by layer) on a visible cell', () => {
    const { w, lvl } = setup();
    const cell = levelCell(lvl, 2, 2);
    setVis(lvl, VISIBLE_LAYER, [cell]);
    setVis(lvl, EXPLORED_LAYER, [cell]);
    place(w, 'item', 2, 2, [{ type: 'renderable', glyph: '!', fg: '#0ff', layer: 1 }]);
    place(w, 'actor', 2, 2, [{ type: 'renderable', glyph: '@', fg: '#fff', layer: 5 }]);

    const frame = buildFrame(w, { width: W, height: H }, { centerOn: 'actor' });
    expect(at(frame, 2, 2).glyph).toBe('@'); // actor (layer 5) beats item (layer 1)
  });

  it('an explored-not-visible cell shows the dimmed tile, not the actor', () => {
    const { w, lvl } = setup();
    const cell = levelCell(lvl, 3, 2);
    setVis(lvl, VISIBLE_LAYER, []); // nothing currently visible
    setVis(lvl, EXPLORED_LAYER, [cell]);
    place(w, 'ghost', 3, 2, [{ type: 'renderable', glyph: 'G', fg: '#0f0', layer: 5 }]);

    const frame = buildFrame(w, { width: W, height: H }, { centerOn: 'ghost' });
    const fc = at(frame, 3, 2);
    expect(fc.glyph).toBe('.'); // remembered floor tile, not the creature
    expect(fc.fg).not.toBe('#aaa'); // dimmed from the floor's full color
  });

  it('an unseen cell is blank', () => {
    const { w, lvl } = setup();
    setVis(lvl, VISIBLE_LAYER, []);
    setVis(lvl, EXPLORED_LAYER, []);
    place(w, 'p', 1, 1, []); // a viewer to anchor the camera
    const frame = buildFrame(w, { width: W, height: H }, { centerOn: 'p' });
    expect(at(frame, 5, 3).glyph).toBe(defaultConfig.render.emptyGlyph);
    expect(at(frame, 5, 3).bg).toBe(defaultConfig.render.defaultBg);
  });

  it('is row-major and the right size', () => {
    const { w } = setup();
    place(w, 'p', 0, 0, []);
    const frame = buildFrame(w, { width: 4, height: 3 }, { centerOn: 'p' });
    expect(frame.width).toBe(4);
    expect(frame.height).toBe(3);
    expect(frame.cells.length).toBe(12);
  });

  it('a wall tile renders even when visible (distinct glyph)', () => {
    const { w, lvl } = setup();
    const cell = levelCell(lvl, 4, 2);
    setTile(lvl, cell, 0); // wall
    setVis(lvl, VISIBLE_LAYER, [cell]);
    place(w, 'p', 4, 2, []);
    const frame = buildFrame(w, { width: W, height: H }, { centerOn: 'p' });
    expect(at(frame, 4, 2).glyph).toBe('#');
  });
});
