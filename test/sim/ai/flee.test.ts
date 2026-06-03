import { describe, it, expect } from 'vitest';
import { createWorld } from '../../../src/index';
import { createLevel, setTile, levelCell } from '../../../src/core/level';
import { defaultConfig } from '../../../src/config/defaults';

// A horizontal corridor with a one-cell DEAD-END pocket branching up at (3,0).
// Threat at the west end (1,1); monster at (3,1); the safe end is east (5,1).
// Plain `-1.2*D` ties the pocket (3,0) with corridor cell (4,1) — and the pocket
// sorts first — so a greedy fleer walks INTO the dead end. The Brogue
// re-Dijkstra deepens the corridor toward the exit so the fleer skips the pocket.
const W = 7;
const H = 3;
const FLOORS: Array<[number, number]> = [
  [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], // corridor
  [3, 0], // dead-end pocket
];

describe('flee field — avoids the dead end, heads to the open exit (§22.11)', () => {
  it('rolls downhill along the corridor, never into the pocket', () => {
    const w = createWorld({ config: defaultConfig, rng: 1 });
    const lvl = createLevel('L', W, H, 0); // all wall
    for (const [x, y] of FLOORS) setTile(lvl, levelCell(lvl, x, y), 1);
    w.state.levels.set('L', lvl);

    const threat = levelCell(lvl, 1, 1);
    const pocket = levelCell(lvl, 3, 0);
    const exit = levelCell(lvl, 5, 1);
    const store = w.services.fields.forLevel('L');
    store.ensure({
      id: 'flee',
      kind: 'goal',
      params: { source: { kind: 'cells', cells: [threat] }, mode: 'flee' },
    });
    const flee = store.data('flee');

    let cur = levelCell(lvl, 3, 1);
    const path = [cur];
    for (let i = 0; i < 20; i++) {
      const step = store.bestStep(flee, cur);
      if (step < 0 || path.includes(step)) break;
      path.push(step);
      cur = step;
    }
    expect(cur).toBe(exit); // reached the open end
    expect(path).not.toContain(pocket); // and never entered the dead end
  });
});
