import { describe, it, expect } from 'vitest';
import { createWorld } from '../../../src/index';
import { decideAction } from '../../../src/sim/ai/decide';
import { createLevel, levelCell, type Level } from '../../../src/core/level';
import { createEntity } from '../../../src/core/entity';
import type { Component } from '../../../src/core/component';
import type { FieldDescriptor } from '../../../src/core/fields';
import type { Registry } from '../../../src/core/registry';
import type { Config } from '../../../src/config/defaults';
import { defaultConfig } from '../../../src/config/defaults';

const W = 9;
const H = 5;
const config: Config = {
  ...defaultConfig,
  factions: { default: 'neutral', matrix: { monster: { player: 'hostile' } } },
};

function setup() {
  const w = createWorld({ config, rng: 1 });
  const lvl = createLevel('L', W, H, 1); // all floor
  w.state.levels.set('L', lvl);
  return { w, lvl };
}
function place(w: ReturnType<typeof setup>['w'], lvl: Level, id: string, x: number, y: number, extra: Component[], mixins: string[] = []) {
  const e = createEntity(id, [{ type: 'position', x, y, levelId: 'L' }, ...extra], mixins);
  w.state.entities.set(id, e);
  w.services.queries.index(e);
  w.services.queries.place(id, 'L', levelCell(lvl, x, y));
  return e;
}

describe('DesireAI (§22.11)', () => {
  it('steps toward a goal set drawn from faction stance', () => {
    const { w, lvl } = setup();
    // A goal field whose goals are entities the 'monster' faction regards as hostile.
    const desc: FieldDescriptor = {
      id: 'enemies',
      kind: 'goal',
      invalidateOn: ['moved'],
      params: { source: { kind: 'stance', stance: 'hostile', faction: 'monster' } },
    };
    (w.services.registries.fields as Registry<FieldDescriptor>).register('enemies', desc);

    place(w, lvl, 'player', 7, 2, [{ type: 'allegiance', faction: 'player' }]);
    place(w, lvl, 'mon', 2, 2, [
      { type: 'allegiance', faction: 'monster' },
      { type: 'desire-ai', desires: [{ fieldId: 'enemies', weight: 1 }] },
    ], ['desire-ai']);

    const action = decideAction(w, 'mon');
    expect(action?.type).toBe('move');
    expect((action as { dir: { x: number } }).dir.x).toBe(1); // east, toward the player
  });

  it('breaks ties deterministically via the RNG', () => {
    const run = () => {
      const { w, lvl } = setup();
      // Two goal cells equidistant from the monster (N and S) → a tie.
      const desc: FieldDescriptor = {
        id: 'twin',
        kind: 'goal',
        params: { source: { kind: 'cells', cells: [levelCell(lvl, 4, 0), levelCell(lvl, 4, 4)] } },
      };
      (w.services.registries.fields as Registry<FieldDescriptor>).register('twin', desc);
      place(w, lvl, 'mon', 4, 2, [{ type: 'desire-ai', desires: [{ fieldId: 'twin', weight: 1 }] }], ['desire-ai']);
      return decideAction(w, 'mon');
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b); // same seed → same tie-break
    expect(a?.type).toBe('move');
    expect(Math.abs((a as { dir: { y: number } }).dir.y)).toBe(1); // moved N or S toward a goal
  });

  it('declines (undefined) when already at the optimum', () => {
    const { w, lvl } = setup();
    const desc: FieldDescriptor = {
      id: 'here',
      kind: 'goal',
      params: { source: { kind: 'cells', cells: [levelCell(lvl, 4, 2)] } },
    };
    (w.services.registries.fields as Registry<FieldDescriptor>).register('here', desc);
    place(w, lvl, 'mon', 4, 2, [{ type: 'desire-ai', desires: [{ fieldId: 'here', weight: 1 }] }], ['desire-ai']);
    expect(decideAction(w, 'mon')).toBeUndefined(); // standing on the goal
  });
});
