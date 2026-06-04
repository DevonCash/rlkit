import { describe, it, expect } from 'vitest';
import { resolve } from '../../src/sim/action';
import { createEntity, get } from '../../src/core/entity';
import type { Position } from '../../src/core/component';
import { cellOf } from '../../src/core/coords';
import { setTile } from '../../src/core/level';
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

describe('move handler — dispatch (relocate/swap/attack/bump)', () => {
  it('moves into a free cell', () => {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 6, 6));
    spawnAt(w, 'hero', 'L', 1, 1);
    const out = resolve(w, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } });
    expect(out.status).toBe('done');
    expect(get<Position>(w.state.entities.get('hero')!, 'position')!.x).toBe(2);
  });

  it('swaps positions with a swappable occupant (two atomic effects)', () => {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 6, 6));
    spawnAt(w, 'hero', 'L', 1, 1);
    spawnAt(w, 'ally', 'L', 2, 1, ['swappable']);

    const out = resolve(w, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } });
    expect(out.status).toBe('done');
    const hero = get<Position>(w.state.entities.get('hero')!, 'position')!;
    const ally = get<Position>(w.state.entities.get('ally')!, 'position')!;
    expect({ x: hero.x, y: hero.y }).toEqual({ x: 2, y: 1 });
    expect({ x: ally.x, y: ally.y }).toEqual({ x: 1, y: 1 });
    // spatial index reflects the swap
    expect([...w.services.queries.at(cellOf({ x: 2, y: 1 }, 6), 'L')]).toEqual(['hero']);
    expect([...w.services.queries.at(cellOf({ x: 1, y: 1 }, 6), 'L')]).toEqual(['ally']);
    // a swap is moves only — no bump.
    if (out.status === 'done') expect(out.events.some((e) => e.type === 'bumped')).toBe(false);
  });

  it('redirects to attack against a non-swappable occupant (rejected when it has no hp)', () => {
    // The engine ships an 'attack' handler, so moving into an occupant becomes
    // an attack. A target with no hp pool can't be damaged → the attack's
    // effect fails validation → rejected, and the hero does not move.
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 6, 6));
    spawnAt(w, 'hero', 'L', 1, 1);
    spawnAt(w, 'statue', 'L', 2, 1);

    const out = resolve(w, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } });
    expect(out.status).toBe('rejected');
    expect(get<Position>(w.state.entities.get('hero')!, 'position')!.x).toBe(1);
  });

  it('walks onto a non-blocking occupant (a floor item) instead of bumping it', () => {
    // Items are entities (a sword on the floor); they must not block a step —
    // you walk onto the cell and then pick it up. `config.movement.passable`
    // lists the walk-over component types (item, stairs).
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 6, 6));
    spawnAt(w, 'hero', 'L', 1, 1);
    const sword = createEntity('sword', [
      { type: 'position', x: 2, y: 1, levelId: 'L' },
      { type: 'item', name: 'Sword', stackable: false, qty: 1 },
    ]);
    w.state.entities.set('sword', sword);
    w.services.queries.index(sword);
    w.services.queries.place('sword', 'L', cellOf({ x: 2, y: 1 }, 6));

    const out = resolve(w, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } });
    expect(out.status).toBe('done');
    expect(get<Position>(w.state.entities.get('hero')!, 'position')!.x).toBe(2);
    // hero and item now share the cell (ready for a `pickup`).
    expect([...w.services.queries.at(cellOf({ x: 2, y: 1 }, 6), 'L')].sort()).toEqual(['hero', 'sword']);
  });

  it('blocks (no friendly fire) when bumping an ally', () => {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 6, 6));
    const hero = spawnAt(w, 'hero', 'L', 1, 1);
    spawnAt(w, 'ally', 'L', 2, 1);
    // Hero regards 'ally' as allied (per-entity override beats the matrix).
    hero.components.set('allegiance', { type: 'allegiance', faction: 'player', overrides: { ally: 'allied' } });

    const out = resolve(w, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } });
    expect(out.status).toBe('fizzled'); // blocked — turn spent, no attack, no move
    expect(get<Position>(w.state.entities.get('hero')!, 'position')!.x).toBe(1);
    // The ally is unharmed (no attack dispatched).
    expect(get<Position>(w.state.entities.get('ally')!, 'position')!.x).toBe(2);
  });

  it('bumps a wall: a free (cost 0) `bumped` event, no relocation', () => {
    const w = makeWorld();
    const level = makeLevel('L', 6, 6);
    // Carve a wall (tile index 0) east of the hero at (2,1).
    setTile(level, cellOf({ x: 2, y: 1 }, 6), 0);
    w.state.levels.set('L', level);
    spawnAt(w, 'hero', 'L', 1, 1);

    const out = resolve(w, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } });
    expect(out.status).toBe('done');
    if (out.status === 'done') {
      expect(out.cost).toBe(0);
      expect(out.events).toEqual([
        { type: 'bumped', entity: 'hero', cell: cellOf({ x: 2, y: 1 }, 6) },
      ]);
    }
    // the hero did not move.
    const pos = get<Position>(w.state.entities.get('hero')!, 'position')!;
    expect({ x: pos.x, y: pos.y }).toEqual({ x: 1, y: 1 });
  });
});
