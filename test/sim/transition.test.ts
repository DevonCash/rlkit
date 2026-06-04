import { describe, it, expect } from 'vitest';
import { createWorld, loadWorld, encodeSave } from '../../src/index';
import { defaultConfig } from '../../src/config/defaults';
import { createLevel, levelCell } from '../../src/core/level';
import { createEntity, get } from '../../src/core/entity';
import type { Position, Stairs } from '../../src/core/component';
import { cellOf } from '../../src/core/coords';
import { perform } from '../../src/sim/action';
import type { World, LevelProvider } from '../../src/core/world';

const W = 20;
const H = 10;

function makeLevel(world: World, id: string, depth: number) {
  const floor = world.services.tiles.index('floor');
  const lvl = createLevel(id, W, H, floor);
  lvl.metadata.depth = depth;
  world.state.levels.set(id, lvl);
  return lvl;
}

/** Add an entity at (levelId, cell) and index + place it. */
function place(world: World, id: string, levelId: string, cell: number, comps: { type: string; [k: string]: unknown }[]) {
  const { x, y } = { x: cell % W, y: Math.floor(cell / W) };
  const e = createEntity(id, [{ type: 'position', x, y, levelId }, ...comps]);
  world.state.entities.set(id, e);
  world.services.queries.index(e);
  world.services.queries.place(id, levelId, cell);
  return e;
}

function actorIds(world: World): string[] {
  return world.state.timeline.actors.map((a) => a.id).sort();
}

describe('level transitions (§8.2)', () => {
  it('descend relocates the player and swaps timeline membership between levels', () => {
    const world = createWorld({ config: defaultConfig, rng: 1 });
    const a = makeLevel(world, 'A', 1);
    const b = makeLevel(world, 'B', 2);
    const downCell = levelCell(a, 5, 5);
    const entranceB = levelCell(b, 2, 2);

    place(world, 'player', 'A', downCell, [{ type: 'allegiance', faction: 'player' }]);
    place(world, 'down', 'A', downCell, [{ type: 'stairs', dir: 'down', to: { levelId: 'B', cell: entranceB } }]);
    place(world, 'goblinA', 'A', levelCell(a, 8, 8), [{ type: 'allegiance', faction: 'monster' }]);
    place(world, 'goblinB', 'B', levelCell(b, 6, 6), [{ type: 'allegiance', faction: 'monster' }]);

    world.services.timeline.addActor('player', 100);
    world.services.timeline.addActor('goblinA', 100);
    // goblinB is on B but not yet scheduled (B was inactive).
    expect(actorIds(world)).toEqual(['goblinA', 'player']);

    const out = perform(world, { type: 'descend', actor: 'player' });
    expect(out.status).toBe('done');

    // Player moved to B at the linked cell.
    const pos = get<Position>(world.state.entities.get('player')!, 'position')!;
    expect(pos.levelId).toBe('B');
    expect(cellOf({ x: pos.x, y: pos.y }, W)).toBe(entranceB);

    // Timeline now scopes to level B: goblinA dropped, goblinB scheduled.
    expect(actorIds(world)).toEqual(['goblinB', 'player']);
    // The level-1 goblin still exists (levels persist).
    expect(world.state.entities.has('goblinA')).toBe(true);
  });

  it('descend builds and links the destination lazily via the level provider', () => {
    const world = createWorld({ config: defaultConfig, rng: 1 });
    const a = makeLevel(world, 'A', 1);
    const downCell = levelCell(a, 5, 5);
    place(world, 'player', 'A', downCell, [{ type: 'allegiance', faction: 'player' }]);
    place(world, 'down', 'A', downCell, [{ type: 'stairs', dir: 'down' }]); // unlinked
    world.services.timeline.addActor('player', 100);

    let built = 0;
    const provider: LevelProvider = (w, req) => {
      built++;
      expect(req.dir).toBe('down');
      expect(req.depth).toBe(2); // source depth 1 + 1
      const lvl = makeLevel(w, 'B', req.depth);
      return { levelId: 'B', cell: levelCell(lvl, 3, 3) };
    };
    world.services.levelProvider = provider;

    perform(world, { type: 'descend', actor: 'player' });

    expect(built).toBe(1);
    expect(world.state.levels.has('B')).toBe(true);
    expect(get<Position>(world.state.entities.get('player')!, 'position')!.levelId).toBe('B');
    // The link is memoized onto the stairs so a second use is direct.
    const stairs = get<Stairs>(world.state.entities.get('down')!, 'stairs')!;
    expect(stairs.to).toEqual({ levelId: 'B', cell: levelCell(world.state.levels.get('B')!, 3, 3) });

    perform(world, { type: 'descend', actor: 'player' }); // already on B, no down stairs here
    expect(built).toBe(1); // provider not called again
  });

  it('round-trips stairs links through save/load and supports ascend back', () => {
    const world = createWorld({ config: defaultConfig, rng: 1 });
    const a = makeLevel(world, 'A', 1);
    const b = makeLevel(world, 'B', 2);
    const downCell = levelCell(a, 5, 5);
    const upCell = levelCell(b, 2, 2);
    place(world, 'player', 'A', downCell, [{ type: 'allegiance', faction: 'player' }]);
    place(world, 'down', 'A', downCell, [{ type: 'stairs', dir: 'down', to: { levelId: 'B', cell: upCell } }]);
    place(world, 'up', 'B', upCell, [{ type: 'stairs', dir: 'up', to: { levelId: 'A', cell: downCell } }]);
    world.services.timeline.addActor('player', 100);

    perform(world, { type: 'descend', actor: 'player' });
    expect(get<Position>(world.state.entities.get('player')!, 'position')!.levelId).toBe('B');

    // Save → load: services rebuilt, stairs links preserved (core re-registers).
    const reloaded = loadWorld(encodeSave(world), { config: defaultConfig });
    const upStairs = get<Stairs>(reloaded.state.entities.get('up')!, 'stairs')!;
    expect(upStairs.to).toEqual({ levelId: 'A', cell: downCell });

    // The player is on B's up-stairs; ascending returns to A's down cell.
    const out = perform(reloaded, { type: 'ascend', actor: 'player' });
    expect(out.status).toBe('done');
    const pos = get<Position>(reloaded.state.entities.get('player')!, 'position')!;
    expect(pos.levelId).toBe('A');
    expect(cellOf({ x: pos.x, y: pos.y }, W)).toBe(downCell);
  });
});
