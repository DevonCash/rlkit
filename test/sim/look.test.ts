import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/index';
import { describeCell } from '../../src/sim/look';
import { defaultConfig } from '../../src/config/defaults';
import { createLevel, levelCell } from '../../src/core/level';
import { createEntity } from '../../src/core/entity';
import { VISIBLE_LAYER } from '../../src/sim/visibility';

const W = 8;
const H = 6;

function setup() {
  const w = createWorld({ config: defaultConfig, rng: 1 });
  const lvl = createLevel('L', W, H, 1); // all floor (index 1)
  w.state.levels.set('L', lvl);
  return { w, lvl };
}

function place(w: ReturnType<typeof setup>['w'], id: string, cell: number, comps: { type: string; [k: string]: unknown }[]) {
  const e = createEntity(id, comps);
  w.state.entities.set(id, e);
  w.services.queries.index(e);
  w.services.queries.place(id, 'L', cell);
  return e;
}

describe('describeCell (§15)', () => {
  it('reports the tile, visibility, and entities (topmost-first) with info', () => {
    const { w, lvl } = setup();
    const cell = levelCell(lvl, 3, 2);
    lvl.layers.set(VISIBLE_LAYER, new Uint8Array(W * H).fill(1)); // whole level visible

    // An item (layer 3) under a creature (layer 5) on the same cell.
    place(w, 'sword', cell, [
      { type: 'position', x: 3, y: 2, levelId: 'L' },
      { type: 'renderable', glyph: ')', fg: '#ccc', layer: 3 },
      { type: 'item', name: 'Rusty Sword', stackable: false, qty: 1 },
    ]);
    place(w, 'goblin', cell, [
      { type: 'position', x: 3, y: 2, levelId: 'L' },
      { type: 'renderable', glyph: 'g', fg: '#6c6', layer: 5 },
      { type: 'info', name: 'Goblin', description: 'A snarling cave-dweller.' },
    ]);

    const d = describeCell(w, 'L', cell);
    expect(d.tile.id).toBe('floor');
    expect(d.visible).toBe(true);
    expect(d.entities.map((e) => e.name)).toEqual(['Goblin', 'Rusty Sword']); // top (layer 5) first
    expect(d.entities[0]!.description).toBe('A snarling cave-dweller.');
    expect(d.entities[0]!.glyph).toBe('g');
    expect(d.entities[1]!.name).toBe('Rusty Sword'); // item.name fallback (no info component)
  });

  it('reports not-visible cells and empty cells', () => {
    const { w, lvl } = setup();
    const cell = levelCell(lvl, 1, 1); // no VISIBLE layer set → not visible
    const d = describeCell(w, 'L', cell);
    expect(d.visible).toBe(false);
    expect(d.entities).toEqual([]);
    expect(d.tile.id).toBe('floor');
  });

  it('returns an empty description for an out-of-bounds cell', () => {
    const { w } = setup();
    const d = describeCell(w, 'L', W * H + 5);
    expect(d.entities).toEqual([]);
    expect(d.visible).toBe(false);
  });
});
