import { describe, it, expect } from 'vitest';
import { perform } from '../../src/sim/action';
import { get } from '../../src/core/entity';
import type { Resources } from '../../src/core/component';
import { cellOf } from '../../src/core/coords';
import { makeWorld, makeLevel, spawnAt } from './helpers';

/** Spawn an entity carrying an hp pool so it can take scripted damage. */
function spawnLiving(w: ReturnType<typeof makeWorld>, id: string, x: number, y: number, hp = 20) {
  const e = spawnAt(w, id, 'L', x, y);
  e.components.set('stats', { type: 'stats', base: { 'max-hp': hp } });
  e.components.set('resources', { type: 'resources', pools: { hp: { current: hp } } });
  w.services.queries.index(e); // pick up the new components in the index
  return e;
}
const hpOf = (e: ReturnType<typeof spawnAt>) => get<Resources>(e, 'resources')!.pools.hp!.current;

describe('movement emits entity:entered/exited (§22.12)', () => {
  it('a relocate move emits exited(from) and entered(to) alongside moved', () => {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 6, 6));
    spawnAt(w, 'hero', 'L', 1, 1);

    const out = perform(w, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } });
    expect(out.status).toBe('done');
    if (out.status === 'done') {
      const from = cellOf({ x: 1, y: 1 }, 6);
      const to = cellOf({ x: 2, y: 1 }, 6);
      expect(out.events).toContainEqual({ type: 'entity:exited', entity: 'hero', cell: from, levelId: 'L' });
      expect(out.events).toContainEqual({ type: 'entity:entered', entity: 'hero', cell: to, levelId: 'L' });
    }
  });
});

describe('damage action (§11A.5)', () => {
  it('drops the target hp through the effect pipeline', () => {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 6, 6));
    const victim = spawnLiving(w, 'victim', 2, 2, 20);

    const out = perform(w, { type: 'damage', actor: 'victim', target: 'victim', amount: 7, cause: 'trap' });
    expect(out.status).toBe('done');
    expect(hpOf(victim)).toBe(13);
  });

  it('rejects when target or amount is missing', () => {
    const w = makeWorld();
    expect(perform(w, { type: 'damage', actor: 'x' }).status).toBe('rejected');
  });
});
