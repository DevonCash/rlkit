import { describe, it, expect } from 'vitest';
import { perform, get, set, cellOf, encodeSave, type World } from 'rlkit';
import type { Position } from 'rlkit';
import { newGame, loadGame, findPlayer, createGame, type Storage } from '../src/game';

function memStore(): Storage {
  let v: string | null = null;
  return { get: () => v, set: (s) => { v = s; }, clear: () => { v = null; } };
}

/** A deterministic, structural digest of the parts of world state that persist. */
function digest(world: World): string {
  const entities = [...world.state.entities.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([id, e]) => ({
      id,
      mixins: [...e.mixins],
      comps: [...e.components.entries()].sort().map(([t, c]) => [t, JSON.stringify(c)]),
    }));
  const levels = [...world.state.levels.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([id, l]) => {
      const tiles = l.layers.get('tiles') as Uint16Array;
      let sum = 0;
      for (const v of tiles) sum = (sum + v) % 1_000_000;
      return { id, depth: l.metadata.depth, w: l.width, h: l.height, tileSum: sum };
    });
  return JSON.stringify({
    entities,
    levels,
    turn: world.state.turn,
    actors: world.state.timeline.actors.map((a) => a.id).sort(),
  });
}

/** Teleport the player onto the stairs of the requested direction on its level. */
function standOnStairs(world: World, player: string, dir: 'up' | 'down'): void {
  const pe = world.state.entities.get(player)!;
  const ppos = get<Position>(pe, 'position')!;
  for (const e of world.services.queries.with('stairs', 'position')) {
    const s = e.components.get('stairs') as unknown as { dir: string };
    const pos = get<Position>(e, 'position')!;
    if (s.dir !== dir || pos.levelId !== ppos.levelId) continue;
    set(pe, { ...ppos, x: pos.x, y: pos.y });
    world.services.queries.place(player, pos.levelId, cellOf({ x: pos.x, y: pos.y }, world.state.levels.get(pos.levelId)!.width));
    return;
  }
  throw new Error(`no ${dir} stairs on the player's level`);
}

const levelOf = (world: World, id: string): string => get<Position>(world.state.entities.get(id)!, 'position')!.levelId;

describe('Depths — determinism', () => {
  it('the same seed builds an identical world', () => {
    const a = newGame(12345);
    const b = newGame(12345);
    expect(digest(a.world)).toBe(digest(b.world));

    // ...and stays identical after the same scripted turns.
    for (const w of [a.world, b.world]) {
      for (let i = 0; i < 5; i++) perform(w, { type: 'wait', actor: findPlayer(w) });
    }
    expect(digest(a.world)).toBe(digest(b.world));
  });

  it('a fresh game has a player and a populated first level', () => {
    const { world, player } = newGame(7);
    expect(levelOf(world, player)).toBe('depth-1');
    const monsters = [...world.services.queries.with('allegiance')].filter(
      (e) => (e.components.get('allegiance') as unknown as { faction: string }).faction === 'monster',
    );
    expect(monsters.length).toBeGreaterThan(0);
  });
});

describe('Depths — descent', () => {
  it('descending scopes the timeline to the entered level and persists the old one', () => {
    const { world, player } = newGame(99);
    standOnStairs(world, player, 'down');
    const out = perform(world, { type: 'descend', actor: player });
    expect(out.status).toBe('done');
    expect(levelOf(world, player)).toBe('depth-2');

    // Every scheduled actor is on the entered level (player included).
    for (const a of world.state.timeline.actors) {
      expect(levelOf(world, a.id)).toBe('depth-2');
    }
    // The first level and its monsters still exist (persistent levels).
    expect(world.state.levels.has('depth-1')).toBe(true);
    const onDepth1 = [...world.state.entities.values()].filter((e) => {
      const p = e.components.get('position') as { levelId?: string } | undefined;
      return p?.levelId === 'depth-1';
    });
    expect(onDepth1.length).toBeGreaterThan(0);
  });
});

describe('Depths — game over', () => {
  it('handles player death without hanging the turn loop', () => {
    const g = createGame({ viewport: { width: 40, height: 20 }, storage: memStore(), seed: 5 });
    g.start();
    g.onCommand({ type: 'confirm' }); // select "New Game" on the title screen
    expect(g.world.state.timeline.actors.some((a) => a.id === g.player)).toBe(true);

    // Simulate death (what the diedReactor does): pull the player from the timeline.
    g.world.services.timeline.remove(g.player);
    // Pre-fix this spun forever on the remaining monsters; it must now return.
    g.onCommand({ type: 'wait' });
    expect(g.world.state.timeline.actors.some((a) => a.id === g.player)).toBe(false);
  });
});

describe('Depths — save versioning', () => {
  const vp = { width: 40, height: 20 };

  it('stamps saves with a version header and only continues compatible ones', () => {
    const store = memStore();
    const g = createGame({ viewport: vp, storage: store, seed: 3 });
    g.start();
    g.onCommand({ type: 'confirm' }); // New Game
    expect(g.hasSave()).toBe(false);

    g.onCommand({ type: 'save' });
    const raw = store.get()!;
    expect(raw.startsWith('depths:')).toBe(true);
    expect(g.hasSave()).toBe(true);

    // A fresh controller over the same storage sees the compatible save.
    const g2 = createGame({ viewport: vp, storage: store, seed: 9 });
    expect(g2.hasSave()).toBe(true);
  });

  it('discards a legacy / version-mismatched save on read (no silent degrade)', () => {
    const legacy = memStore();
    legacy.set('1\nlegacy-engine-blob'); // old un-versioned format
    const g = createGame({ viewport: vp, storage: legacy, seed: 1 });
    expect(g.hasSave()).toBe(false);
    expect(legacy.get()).toBeNull(); // cleared so it can't be loaded
  });
});

describe('Depths — save / load', () => {
  it('round-trips world state and keeps the level provider working after load', () => {
    const fresh = newGame(2024);
    standOnStairs(fresh.world, fresh.player, 'down');
    perform(fresh.world, { type: 'descend', actor: fresh.player }); // build depth-2
    expect(levelOf(fresh.world, fresh.player)).toBe('depth-2');

    const blob = encodeSave(fresh.world);
    const loaded = loadGame(blob);

    // State survives byte-for-byte (structural digest).
    expect(digest(loaded.world)).toBe(digest(fresh.world));
    // Themed tiles re-registered in the same order → indices still resolve.
    expect(loaded.world.services.tiles.index('crypt_floor')).toBeGreaterThan(0);

    // Provider re-attached: descending again builds depth-3 in the loaded world.
    standOnStairs(loaded.world, loaded.player, 'down');
    perform(loaded.world, { type: 'descend', actor: loaded.player });
    expect(levelOf(loaded.world, loaded.player)).toBe('depth-3');
    expect(loaded.world.state.levels.has('depth-3')).toBe(true);
  });
});
