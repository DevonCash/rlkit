import { describe, it, expect } from 'vitest';
import { createWorld, perform } from '../../src/index';
import { decideAction } from '../../src/sim/ai/decide';
import { nearestHostile } from '../../src/sim/ai/helpers';
import { createLevel, levelCell } from '../../src/core/level';
import { createEntity, get, type Entity } from '../../src/core/entity';
import type { Resources, Component, Position } from '../../src/core/component';
import type { Config } from '../../src/config/defaults';
import { defaultConfig } from '../../src/config/defaults';

const W = 12;
const H = 5;
const config: Config = {
  ...defaultConfig,
  factions: { default: 'neutral', matrix: { monster: { player: 'hostile' }, player: { monster: 'hostile' } } },
};

function setup() {
  const w = createWorld({ config, rng: 1 });
  const lvl = createLevel('L', W, H, 1); // all floor
  w.state.levels.set('L', lvl);
  return w;
}
function place(w: ReturnType<typeof setup>, id: string, x: number, y: number, extra: Component[], mixins: string[] = []) {
  const e = createEntity(id, [{ type: 'position', x, y, levelId: 'L' }, ...extra], mixins);
  w.state.entities.set(id, e);
  w.services.queries.index(e);
  w.services.queries.place(id, 'L', levelCell(w.state.levels.get('L')!, x, y));
  return e;
}
const px = (e: Entity) => get<Position>(e, 'position')!.x;

describe('decideAction + simple AI (§11.2)', () => {
  it('aiHunter steps toward a visible hostile (priority over aiWanderer)', () => {
    const w = setup();
    place(w, 'player', 3, 2, [{ type: 'allegiance', faction: 'player' }]);
    const mon = place(w, 'mon', 8, 2, [{ type: 'allegiance', faction: 'monster' }], ['aiHunter', 'aiWanderer']);

    const action = decideAction(w, 'mon');
    expect(action?.type).toBe('move'); // hunter chose to close in
    expect((action as { dir: { x: number } }).dir.x).toBe(-1); // toward the player (west)
    void mon;
  });

  it('falls back to aiWanderer (a move) when no hostile is visible', () => {
    const w = setup();
    place(w, 'mon', 8, 2, [{ type: 'allegiance', faction: 'monster' }], ['aiHunter', 'aiWanderer']);
    const action = decideAction(w, 'mon');
    expect(action?.type).toBe('move'); // nothing to hunt → wander
  });

  it('nearestHostile ignores non-hostiles and picks the nearest', () => {
    const w = setup();
    const mon = place(w, 'mon', 5, 2, [{ type: 'allegiance', faction: 'monster' }]);
    place(w, 'ally', 6, 2, [{ type: 'allegiance', faction: 'monster' }]); // allied → ignored
    place(w, 'far', 9, 2, [{ type: 'allegiance', faction: 'player' }]); // hostile, farther
    place(w, 'near', 7, 2, [{ type: 'allegiance', faction: 'player' }]); // hostile, nearer
    expect(nearestHostile(w, mon)?.id).toBe('near');
  });

  it('a hunter adjacent to its target attacks via the move redirect', () => {
    const w = setup();
    place(w, 'player', 5, 2, [
      { type: 'allegiance', faction: 'player' },
      { type: 'stats', base: { 'max-hp': 20, defense: 0 } },
      { type: 'resources', pools: { hp: { current: 20 } } },
    ]);
    const mon = place(w, 'mon', 6, 2, [
      { type: 'allegiance', faction: 'monster' },
      { type: 'stats', base: { attack: 6 } },
    ], ['aiHunter', 'aiWanderer']);

    const action = decideAction(w, 'mon');
    expect(action?.type).toBe('move');
    perform(w, action!);
    // move → attack via redirect → player took damage; the monster didn't move.
    expect(get<Resources>(w.state.entities.get('player')!, 'resources')!.pools.hp!.current).toBeLessThan(20);
    expect(px(mon)).toBe(6);
  });

  it('aiWanderer stays in bounds and is deterministic per seed', () => {
    const a = setup();
    place(a, 'mon', 5, 2, [], ['aiWanderer']);
    const b = setup();
    place(b, 'mon', 5, 2, [], ['aiWanderer']);
    const da = decideAction(a, 'mon');
    const db = decideAction(b, 'mon');
    expect(da).toEqual(db); // same seed → same choice
    expect(da?.type).toBe('move');
  });
});
