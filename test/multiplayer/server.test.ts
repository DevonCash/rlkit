import { describe, it, expect } from 'vitest';
import { createWorld, createGameServer, visibleLayerFor, exploredLayerFor } from '../../src/index';
import { decodeState } from '../../src/adapters/storage';
import { createLevel, levelCell, type Level } from '../../src/core/level';
import { createEntity, get } from '../../src/core/entity';
import type { Position } from '../../src/core/component';
import type { World } from '../../src/core/world';
import type { EntityId } from '../../src/core/entity';
import type { WorldState } from '../../src/core/world';
import { defaultConfig } from '../../src/config/defaults';

const W = 20;
const H = 7;

/** A spawnPlayer that drops each new player at a distinct floor cell. */
function makeSpawn(lvl: Level) {
  let n = 0;
  return (world: World): EntityId => {
    const id = `player-${n}`;
    const x = 3 + n * 5;
    n++;
    const e = createEntity(id, [
      { type: 'position', x, y: 3, levelId: lvl.id },
      { type: 'renderable', glyph: '@', fg: '#fff', layer: 10 },
      { type: 'allegiance', faction: 'player' },
      { type: 'stats', base: { 'max-hp': 30, 'sight-radius': 8 } },
      { type: 'resources', pools: { hp: { current: 30 } } },
    ]);
    world.state.entities.set(id, e);
    world.services.queries.index(e);
    world.services.queries.place(id, lvl.id, levelCell(lvl, x, 3));
    world.services.timeline.addActor(id, 10);
    return id;
  };
}

function setup() {
  const world = createWorld({ config: defaultConfig, rng: 1 });
  const lvl = createLevel('L', W, H, 1);
  world.state.levels.set('L', lvl);
  return { world, lvl, server: createGameServer({ world, spawnPlayer: makeSpawn(lvl) }) };
}
const xOf = (world: World, id: string) => get<Position>(world.state.entities.get(id)!, 'position')!.x;

describe('GameServer (§6.5) — authoritative co-op session', () => {
  it('joins players, applies their buffered actions in the shared world, and leaves', () => {
    const { world, server } = setup();
    const a = server.join();
    const b = server.join();
    expect([...server.players].sort()).toEqual([a, b].sort());

    server.enqueue(a, { type: 'move', actor: a, dir: { x: 1, y: 0 } });
    server.enqueue(b, { type: 'move', actor: b, dir: { x: 1, y: 0 } });
    const update = server.tick(1);
    expect(update.acted.sort()).toEqual([a, b].sort());
    expect(xOf(world, a)).toBe(3 + 1); // player-0 spawned at x=3 → moved east
    expect(xOf(world, b)).toBe(8 + 1); // player-1 at x=8 → moved east

    server.leave(a);
    expect(server.players.has(a)).toBe(false);
    expect(world.state.entities.has(a)).toBe(false);
  });

  it('produces a snapshot a (re)joining client can decode', () => {
    const { server } = setup();
    const a = server.join();
    const b = server.join();
    server.tick(1);
    const state = decodeState(server.snapshot()) as WorldState;
    expect(state.entities.has(a)).toBe(true);
    expect(state.entities.has(b)).toBe(true);
  });

  it('idles only once every player has left', () => {
    const { server } = setup();
    const a = server.join();
    const b = server.join();
    expect(server.tick(1).idle).toBe(false);
    server.leave(a);
    expect(server.tick(1).idle).toBe(false); // b still playing
    server.leave(b);
    expect(server.tick(1).idle).toBe(true);
  });

  it('viewFor (hidden fog) renders only what THAT player can see — the wire leaks nothing', () => {
    const world = createWorld({ config: defaultConfig, rng: 1 });
    const lvl = createLevel('L', W, H, 1);
    world.state.levels.set('L', lvl);
    const server = createGameServer({ world, spawnPlayer: makeSpawn(lvl), fog: 'hidden' });
    const a = server.join(); // at x=3
    const b = server.join(); // at x=8

    // A monster only B is close enough to see (range 8): x=12 is 9 from A, 4 from B.
    const mon = createEntity('mon', [
      { type: 'position', x: 12, y: 3, levelId: 'L' },
      { type: 'renderable', glyph: 'M', fg: '#f00', layer: 5 },
    ]);
    world.state.entities.set('mon', mon);
    world.services.queries.index(mon);
    world.services.queries.place('mon', 'L', levelCell(lvl, 12, 3));

    server.tick(1); // computes each player's private FOV

    const vp = { width: W, height: H };
    const hasMon = (id: string) => server.viewFor(id, vp).frame.cells.some((c) => c.glyph === 'M');
    expect(hasMon(b)).toBe(true); // B sees the monster
    expect(hasMon(a)).toBe(false); // A does NOT — it isn't even in A's frame

    const view = server.viewFor(a, vp);
    expect(view.hp).toEqual({ current: 30, max: 30 });
    expect(view.alive).toBe(true);
    server.leave(a);
    expect(server.viewFor(a, vp).alive).toBe(false);
  });

  it('drops a player’s per-level visibility layers on leave (no accumulation)', () => {
    const world = createWorld({ config: defaultConfig, rng: 1 });
    const lvl = createLevel('L', W, H, 1);
    world.state.levels.set('L', lvl);
    const server = createGameServer({ world, spawnPlayer: makeSpawn(lvl), fog: 'hidden' });
    const a = server.join(); // join() seeds the player's FOV layers
    expect(lvl.layers.has(visibleLayerFor(a))).toBe(true);
    expect(lvl.layers.has(exploredLayerFor(a))).toBe(true);
    server.leave(a);
    expect(lvl.layers.has(visibleLayerFor(a))).toBe(false);
    expect(lvl.layers.has(exploredLayerFor(a))).toBe(false);
  });

  it('viewFor (shared fog) shows the monster to both players', () => {
    const world = createWorld({ config: defaultConfig, rng: 1 });
    const lvl = createLevel('L', W, H, 1);
    world.state.levels.set('L', lvl);
    const server = createGameServer({ world, spawnPlayer: makeSpawn(lvl), fog: 'shared' });
    const a = server.join();
    const b = server.join();
    const mon = createEntity('mon', [
      { type: 'position', x: 12, y: 3, levelId: 'L' },
      { type: 'renderable', glyph: 'M', fg: '#f00', layer: 5 },
    ]);
    world.state.entities.set('mon', mon);
    world.services.queries.index(mon);
    world.services.queries.place('mon', 'L', levelCell(lvl, 12, 3));
    server.tick(1);
    const vp = { width: W, height: H };
    expect(server.viewFor(a, vp).frame.cells.some((c) => c.glyph === 'M')).toBe(true);
    expect(server.viewFor(b, vp).frame.cells.some((c) => c.glyph === 'M')).toBe(true);
  });

  it('reports the per-tick event stream and clears it next tick (R4)', () => {
    const { server } = setup();
    const a = server.join();
    server.enqueue(a, { type: 'move', actor: a, dir: { x: 1, y: 0 } });
    const moved = server.tick(1);
    expect(moved.events.some((e) => e.type === 'moved')).toBe(true);
    // No buffered action next tick → no movement events leak from the prior tick.
    const idleTick = server.tick(1);
    expect(idleTick.events.some((e) => e.type === 'moved')).toBe(false);
  });

  it('canViewerSee answers per-player visual perception (hidden fog, R4)', () => {
    const world = createWorld({ config: defaultConfig, rng: 1 });
    const lvl = createLevel('L', W, H, 1);
    world.state.levels.set('L', lvl);
    const server = createGameServer({ world, spawnPlayer: makeSpawn(lvl), fog: 'hidden' });
    const a = server.join(); // x=3
    const b = server.join(); // x=8
    const monCell = levelCell(lvl, 12, 3); // 9 from A (>radius 8), 4 from B
    const mon = createEntity('mon', [{ type: 'position', x: 12, y: 3, levelId: 'L' }]);
    world.state.entities.set('mon', mon);
    world.services.queries.index(mon);
    world.services.queries.place('mon', 'L', monCell);
    server.tick(1); // compute private FOVs

    expect(server.canViewerSee(b, monCell)).toBe(true); // B perceives that cell
    expect(server.canViewerSee(a, monCell)).toBe(false); // A does not
    expect(server.canViewerSee(a, levelCell(lvl, 3, 3))).toBe(true); // A sees its own cell
    // A dead/off-timeline player composes as all-seeing game-side (engine says false).
    expect(server.canViewerSee('ghost', monCell)).toBe(false);
  });

  it('carries a game-supplied per-player view extension (viewExtra, R6)', () => {
    const world = createWorld({ config: defaultConfig, rng: 1 });
    const lvl = createLevel('L', W, H, 1);
    world.state.levels.set('L', lvl);
    type Extra = { oxygen: number; role: string };
    const server = createGameServer<Extra>({
      world,
      spawnPlayer: makeSpawn(lvl),
      fog: 'hidden',
      // Reads only the viewer's own state (the documented viewer-only contract).
      viewExtra: (_w, id): Extra => ({ oxygen: 100, role: id === 'player-0' ? 'traitor' : 'crew' }),
    });
    const a = server.join();
    const b = server.join();
    server.tick(1);
    const vp = { width: W, height: H };
    expect(server.viewFor(a, vp).extra).toEqual({ oxygen: 100, role: 'traitor' });
    expect(server.viewFor(b, vp).extra).toEqual({ oxygen: 100, role: 'crew' });
    // Each player only ever receives its OWN extra (the payload is built per id).
    expect(server.viewFor(a, vp).extra?.role).not.toBe(server.viewFor(b, vp).extra?.role);
  });

  it('is deterministic: same join/enqueue/tick stream → identical worlds', () => {
    const digest = (world: World) =>
      JSON.stringify([...world.state.entities.values()].map((e) => [e.id, get<Position>(e, 'position')]).sort((x, y) => (x[0]! < y[0]! ? -1 : 1)));
    const run = () => {
      const { world, server } = setup();
      const a = server.join();
      const b = server.join();
      for (let i = 0; i < 20; i++) {
        if (i % 3 === 0) {
          server.enqueue(a, { type: 'move', actor: a, dir: { x: 1, y: 0 } });
          server.enqueue(b, { type: 'move', actor: b, dir: { x: 0, y: 1 } });
        }
        server.tick(1);
      }
      return world;
    };
    expect(digest(run())).toBe(digest(run()));
  });
});
