import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { createWorld } from '../../../src/index';
import { createLevel, setTile, levelCell, isWalkable, type Level } from '../../../src/core/level';
import { neighbors4, type Cell } from '../../../src/core/coords';
import { defaultConfig } from '../../../src/config/defaults';
import type { TilePalette } from '../../../src/core/tiles';

const W = 12;
const H = 8;

function setup(walls: Array<[number, number]> = []) {
  const w = createWorld({ config: defaultConfig, rng: 1 });
  const lvl = createLevel('L', W, H, 1); // all floor (index 1)
  for (const [x, y] of walls) setTile(lvl, levelCell(lvl, x, y), 0); // wall (index 0)
  w.state.levels.set('L', lvl);
  return { w, lvl, store: w.services.fields.forLevel('L') };
}

/** Independent 4-connected BFS ground truth over walkable cells. */
function bfsTruth(lvl: Level, palette: TilePalette, goal: Cell): Float64Array {
  const dist = new Float64Array(W * H).fill(Infinity);
  if (!isWalkable(lvl, goal, palette)) return dist;
  dist[goal] = 0;
  const q = [goal];
  let head = 0;
  while (head < q.length) {
    const c = q[head++]!;
    for (const nb of neighbors4(c, W, H)) {
      if (isWalkable(lvl, nb, palette) && dist[c]! + 1 < dist[nb]!) {
        dist[nb] = dist[c]! + 1;
        q.push(nb);
      }
    }
  }
  return dist;
}

describe('goal field (§22.11)', () => {
  test.prop([fc.integer({ min: 0, max: W * H - 1 })])(
    'goal distances match an independent BFS; walls/unreachable are Infinity',
    (goalCell) => {
      const walls: Array<[number, number]> = [
        [4, 0], [4, 1], [4, 2], [4, 3], [4, 4], // a wall column with a gap at y=5..7
        [8, 7], [8, 6], [8, 5], [8, 4],
      ];
      const { w, lvl, store } = setup(walls);
      if (!isWalkable(lvl, goalCell, w.services.tiles)) return; // skip goals in walls
      store.ensure({ id: 'g', kind: 'goal', params: { source: { kind: 'cells', cells: [goalCell] } } });
      const field = store.data('g');
      const truth = bfsTruth(lvl, w.services.tiles, goalCell);
      for (let c = 0; c < W * H; c++) {
        if (truth[c] === Infinity) expect(field[c]).toBe(Infinity);
        else expect(field[c]).toBe(truth[c]);
      }
    },
  );

  it('descends strictly toward the goal from any reachable cell', () => {
    const { lvl, store, w } = setup([[4, 0], [4, 1], [4, 2], [4, 3]]);
    const goal = levelCell(lvl, 1, 1);
    store.ensure({ id: 'g', kind: 'goal', params: { source: { kind: 'cells', cells: [goal] } } });
    const field = store.data('g');
    for (let c = 0; c < W * H; c++) {
      const d = field[c]!;
      if (d === 0 || !Number.isFinite(d) || !isWalkable(lvl, c, w.services.tiles)) continue;
      const step = store.bestStep(field, c);
      expect(step).toBeGreaterThanOrEqual(0); // a strictly-lower neighbor exists
      expect(field[step]!).toBeLessThan(d);
    }
  });
});

describe('composite (§22.11)', () => {
  it('equals the naive weighted sum with Infinity clamped', () => {
    const { lvl, store } = setup();
    const a = levelCell(lvl, 1, 1);
    const b = levelCell(lvl, 10, 6);
    store.ensure({ id: 'ga', kind: 'goal', params: { source: { kind: 'cells', cells: [a] } } });
    store.ensure({ id: 'gb', kind: 'goal', params: { source: { kind: 'cells', cells: [b] } } });
    const profile = [
      { fieldId: 'ga', weight: 1.5 },
      { fieldId: 'gb', weight: -2 },
    ];
    const comp = store.composite(profile);
    const fa = store.data('ga');
    const fb = store.data('gb');
    const maxD = defaultConfig.fields.maxDistance;
    for (let c = 0; c < W * H; c++) {
      const expected = Math.min(fa[c]!, maxD) * 1.5 + Math.min(fb[c]!, maxD) * -2;
      expect(comp[c]).toBeCloseTo(expected, 5);
      expect(Number.isFinite(comp[c]!)).toBe(true); // no -Infinity poisoning
    }
  });

  it('a negative weight on an unreachable (Infinity) cell stays finite', () => {
    // Wall off a pocket so some cells are unreachable from the goal.
    const { lvl, store } = setup([
      [5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [5, 7],
    ]);
    const goal = levelCell(lvl, 1, 1);
    store.ensure({ id: 'g', kind: 'goal', params: { source: { kind: 'cells', cells: [goal] } } });
    const comp = store.composite([{ fieldId: 'g', weight: -3 }]);
    for (let c = 0; c < W * H; c++) expect(Number.isFinite(comp[c]!)).toBe(true);
  });
});

describe('dirty / invalidation lifecycle (§22.11)', () => {
  it('a field recomputes only when its invalidateOn event fires', () => {
    const { w, lvl, store } = setup();
    const a = levelCell(lvl, 1, 1);
    const b = levelCell(lvl, 9, 6);
    const cells = [a]; // a mutable source ("wand positions")
    store.ensure({ id: 'wands', kind: 'goal', invalidateOn: ['wand:moved'], params: { source: { kind: 'cells', cells } } });

    expect(store.data('wands')[b]).not.toBe(0); // b is not yet a goal

    cells.push(b); // a wand "moved" to b, but no event emitted yet
    expect(store.data('wands')[b]).not.toBe(0); // stale — NOT recomputed

    w.services.bus.emit({ type: 'wand:moved' });
    expect(store.data('wands')[b]).toBe(0); // recomputed → b is now a goal
  });

  it('composites cache until a contributing field changes', () => {
    const { w, lvl, store } = setup();
    const a = levelCell(lvl, 1, 1);
    const probe = levelCell(lvl, 9, 6);
    const cells = [a];
    store.ensure({ id: 'g', kind: 'goal', invalidateOn: ['wand:moved'], params: { source: { kind: 'cells', cells } } });
    const profile = [{ fieldId: 'g', weight: 1 }];

    const before = store.composite(profile)[probe]!;
    cells.push(probe); // move a goal onto the probe, but don't invalidate
    expect(store.composite(profile)[probe]).toBe(before); // cached, unchanged

    w.services.bus.emit({ type: 'wand:moved' });
    expect(store.composite(profile)[probe]).toBeLessThan(before); // rebuilt: probe is now a goal (0)
  });
});
