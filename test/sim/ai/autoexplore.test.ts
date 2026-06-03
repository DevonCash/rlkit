import { describe, it, expect } from 'vitest';
import { createWorld } from '../../../src/index';
import { autoexploreStep } from '../../../src/sim/ai/autoexplore';
import { createLevel, type Level } from '../../../src/core/level';
import { EXPLORED_LAYER } from '../../../src/sim/visibility';
import { createEntity } from '../../../src/core/entity';
import { defaultConfig } from '../../../src/config/defaults';

const W = 9;
const H = 3;

function setup() {
  const w = createWorld({ config: defaultConfig, rng: 1 });
  const lvl = createLevel('L', W, H, 1); // all floor
  w.state.levels.set('L', lvl);
  return { w, lvl };
}
function markExplored(lvl: Level, predicate: (x: number, y: number) => boolean) {
  const layer = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (predicate(x, y)) layer[y * W + x] = 1;
  lvl.layers.set(EXPLORED_LAYER, layer);
}

describe('autoexplore (§11.3.6)', () => {
  it('steps toward the nearest unexplored frontier', () => {
    const { w, lvl } = setup();
    markExplored(lvl, (x) => x <= 4); // west half explored, east half unknown
    const e = createEntity('explorer', [{ type: 'position', x: 2, y: 1, levelId: 'L' }]);
    w.state.entities.set('explorer', e);

    const action = autoexploreStep(w, 'explorer');
    expect(action?.type).toBe('bump');
    expect((action as { dir: { x: number } }).dir.x).toBe(1); // east, toward the unknown
  });

  it('returns undefined when everything reachable is explored', () => {
    const { w, lvl } = setup();
    markExplored(lvl, () => true); // all explored
    const e = createEntity('explorer', [{ type: 'position', x: 4, y: 1, levelId: 'L' }]);
    w.state.entities.set('explorer', e);
    expect(autoexploreStep(w, 'explorer')).toBeUndefined();
  });
});
