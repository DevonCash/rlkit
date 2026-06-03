import { describe, it, expect } from 'vitest';
import { resolve } from '../../src/sim/action';
import { get } from '../../src/core/entity';
import type { Position } from '../../src/core/component';
import { cellOf } from '../../src/core/coords';
import { makeWorld, makeLevel, spawnAt } from './helpers';

describe('move handler', () => {
  it('moves the actor and updates the spatial index', () => {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 6, 6));
    spawnAt(w, 'hero', 'L', 2, 2);

    const out = resolve(w, { type: 'move', actor: 'hero', dir: { x: 0, y: 1 } });
    expect(out.status).toBe('done');
    const pos = get<Position>(w.state.entities.get('hero')!, 'position')!;
    expect({ x: pos.x, y: pos.y }).toEqual({ x: 2, y: 3 });
    expect([...w.services.queries.at(cellOf({ x: 2, y: 3 }, 6), 'L')]).toEqual(['hero']);
    expect([...w.services.queries.at(cellOf({ x: 2, y: 2 }, 6), 'L')]).toEqual([]);
  });

  it('rejects a move out of bounds', () => {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 3, 3));
    spawnAt(w, 'hero', 'L', 0, 0);
    expect(resolve(w, { type: 'move', actor: 'hero', dir: { x: 0, y: -1 } }).status).toBe('rejected');
  });
});

describe('wait handler', () => {
  it('spends the turn with no effects', () => {
    const w = makeWorld();
    const out = resolve(w, { type: 'wait', actor: 'hero' });
    expect(out.status).toBe('done');
    if (out.status === 'done') {
      expect(out.events).toEqual([]);
      expect(out.cost).toBe(w.services.config.baseActionCost);
    }
  });
});

describe('bump handler', () => {
  it('moves into a free cell', () => {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 6, 6));
    spawnAt(w, 'hero', 'L', 1, 1);
    const out = resolve(w, { type: 'bump', actor: 'hero', dir: { x: 1, y: 0 } });
    expect(out.status).toBe('done');
    expect(get<Position>(w.state.entities.get('hero')!, 'position')!.x).toBe(2);
  });

  it('swaps positions with a swappable occupant (two atomic effects)', () => {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 6, 6));
    spawnAt(w, 'hero', 'L', 1, 1);
    spawnAt(w, 'ally', 'L', 2, 1, ['swappable']);

    const out = resolve(w, { type: 'bump', actor: 'hero', dir: { x: 1, y: 0 } });
    expect(out.status).toBe('done');
    const hero = get<Position>(w.state.entities.get('hero')!, 'position')!;
    const ally = get<Position>(w.state.entities.get('ally')!, 'position')!;
    expect({ x: hero.x, y: hero.y }).toEqual({ x: 2, y: 1 });
    expect({ x: ally.x, y: ally.y }).toEqual({ x: 1, y: 1 });
    // spatial index reflects the swap
    expect([...w.services.queries.at(cellOf({ x: 2, y: 1 }, 6), 'L')]).toEqual(['hero']);
    expect([...w.services.queries.at(cellOf({ x: 1, y: 1 }, 6), 'L')]).toEqual(['ally']);
  });

  it('redirects to attack against a non-swappable occupant (rejected when it has no hp)', () => {
    // The engine now ships an 'attack' handler, so bumping an occupant becomes
    // an attack. A target with no hp pool can't be damaged → the attack's
    // effect fails validation → rejected, and the hero does not move.
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 6, 6));
    spawnAt(w, 'hero', 'L', 1, 1);
    spawnAt(w, 'statue', 'L', 2, 1);

    const out = resolve(w, { type: 'bump', actor: 'hero', dir: { x: 1, y: 0 } });
    expect(out.status).toBe('rejected');
    expect(get<Position>(w.state.entities.get('hero')!, 'position')!.x).toBe(1);
  });
});
