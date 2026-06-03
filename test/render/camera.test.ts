import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/index';
import { viewportOrigin } from '../../src/render/camera';
import { createLevel, levelCell } from '../../src/core/level';
import { createEntity } from '../../src/core/entity';
import { defaultConfig } from '../../src/config/defaults';

function setup() {
  const w = createWorld({ config: defaultConfig, rng: 1 });
  const lvl = createLevel('L', 40, 30, 1);
  w.state.levels.set('L', lvl);
  return { w, lvl };
}

describe('camera viewportOrigin', () => {
  it('centers the viewport on the target', () => {
    const { w, lvl } = setup();
    const e = createEntity('p', [{ type: 'position', x: 20, y: 15, levelId: 'L' }]);
    w.state.entities.set('p', e);
    const origin = viewportOrigin(w, lvl, { width: 10, height: 8 }, { centerOn: 'p' });
    expect(origin).toEqual({ x: 15, y: 11 }); // 20-5, 15-4
  });

  it('clamps to the top-left edge', () => {
    const { w, lvl } = setup();
    const e = createEntity('p', [{ type: 'position', x: 1, y: 1, levelId: 'L' }]);
    w.state.entities.set('p', e);
    const origin = viewportOrigin(w, lvl, { width: 10, height: 8 }, { centerOn: 'p' });
    expect(origin).toEqual({ x: 0, y: 0 });
  });

  it('clamps to the bottom-right edge', () => {
    const { w, lvl } = setup();
    const e = createEntity('p', [{ type: 'position', x: 39, y: 29, levelId: 'L' }]);
    w.state.entities.set('p', e);
    const origin = viewportOrigin(w, lvl, { width: 10, height: 8 }, { centerOn: 'p' });
    expect(origin).toEqual({ x: 30, y: 22 }); // 40-10, 30-8
  });

  it('accepts a packed cell as the target', () => {
    const { w, lvl } = setup();
    const origin = viewportOrigin(w, lvl, { width: 10, height: 8 }, { centerOn: levelCell(lvl, 20, 15), levelId: 'L' });
    expect(origin).toEqual({ x: 15, y: 11 });
  });
});
