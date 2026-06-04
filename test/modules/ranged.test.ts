import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/index';
import { rangedModule, aiRangedMixin } from '../../src/modules/ranged';
import { perform } from '../../src/sim/action';
import { createEntity, get } from '../../src/core/entity';
import type { Resources } from '../../src/core/component';
import { createLevel, levelCell, setTile } from '../../src/core/level';
import { defaultConfig } from '../../src/config/defaults';

const W = 10;
const H = 10;
const config = {
  ...defaultConfig,
  combat: { ...defaultConfig.combat, variance: 0 },
  factions: { default: 'neutral' as const, matrix: { monster: { player: 'hostile' as const }, player: { monster: 'hostile' as const } } },
};

function setup() {
  const w = createWorld({ config, rng: 1, modules: [rangedModule()] });
  const floor = w.services.tiles.index('floor');
  const lvl = createLevel('L', W, H, floor);
  w.state.levels.set('L', lvl);
  return { w, lvl };
}
function place(w: ReturnType<typeof setup>['w'], id: string, x: number, y: number, comps: { type: string; [k: string]: unknown }[]) {
  const e = createEntity(id, [{ type: 'position', x, y, levelId: 'L' }, ...comps]);
  w.state.entities.set(id, e);
  w.services.queries.index(e);
  w.services.queries.place(id, 'L', levelCell(w.state.levels.get('L')!, x, y));
  return e;
}
const hp = (w: ReturnType<typeof setup>['w']) => get<Resources>(w.state.entities.get('t')!, 'resources')!.pools.hp!.current;

describe('rangedModule', () => {
  it('damages a target in range with line of sight', () => {
    const { w, lvl } = setup();
    place(w, 'archer', 1, 1, [{ type: 'stats', base: { range: 5, 'ranged-attack': 6 } }]);
    place(w, 't', 1, 4, [{ type: 'stats', base: { 'max-hp': 20 } }, { type: 'resources', pools: { hp: { current: 20 } } }]);
    const out = perform(w, { type: 'ranged', actor: 'archer', target: levelCell(lvl, 1, 4) });
    expect(out.status).toBe('done');
    expect(hp(w)).toBe(20 - 6); // ranged-attack 6, no defense, variance 0
  });

  it('rejects out of range and blocked line of sight', () => {
    const { w, lvl } = setup();
    place(w, 'archer', 1, 1, [{ type: 'stats', base: { range: 2, 'ranged-attack': 6 } }]);
    place(w, 't', 1, 5, [{ type: 'stats', base: { 'max-hp': 20 } }, { type: 'resources', pools: { hp: { current: 20 } } }]);
    expect(perform(w, { type: 'ranged', actor: 'archer', target: levelCell(lvl, 1, 5) }).status).toBe('rejected'); // range 2 < 4
    expect(hp(w)).toBe(20);

    // In range now, but wall the line of sight.
    get<{ type: 'stats'; base: Record<string, number> }>(w.state.entities.get('archer')!, 'stats')!.base.range = 9;
    setTile(lvl, levelCell(lvl, 1, 3), 0); // wall between
    expect(perform(w, { type: 'ranged', actor: 'archer', target: levelCell(lvl, 1, 5) }).status).toBe('rejected');
    expect(hp(w)).toBe(20);
  });

  it('aiRanged shoots when the target is in range with LoS', () => {
    const { w, lvl } = setup();
    const archer = place(w, 'archer', 1, 1, [
      { type: 'stats', base: { range: 6, 'ranged-attack': 4, 'sight-radius': 8 } },
      { type: 'allegiance', faction: 'monster' },
    ]);
    place(w, 'hero', 1, 4, [
      { type: 'stats', base: {} },
      { type: 'resources', pools: { hp: { current: 30 } } },
      { type: 'allegiance', faction: 'player' },
    ]);
    void lvl;
    const action = aiRangedMixin.takeTurn!(archer, w);
    expect(action?.type).toBe('ranged');
  });
});
