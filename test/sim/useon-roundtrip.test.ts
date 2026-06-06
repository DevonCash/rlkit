/**
 * R5 — the `useOn` declaration-merge seam, proven end to end from THIS repo
 * (no patching of engine files): augment `ActionMap`, register a handler, and run
 * a client message → decode → enqueue → resolve round-trip, typed with no `any`.
 *
 * External consumers augment `declare module 'rlkit'`; in-repo we augment the
 * declaring module by path. The merge adds a strongly-typed variant to `Action`.
 */
import { describe, it, expect } from 'vitest';
import { makeWorld, makeLevel, spawnAt } from './helpers';
import { perform } from '../../src/sim/action';
import type { Action, ActionHandler } from '../../src/core/action';
import type { Registry } from '../../src/core/registry';
import type { EntityId } from '../../src/core/entity';
import type { Cell } from '../../src/core/coords';
import { setTileEffect } from '../../src/core/tile-effect';
import { levelCell } from '../../src/core/level';

/** A discriminated tool target — EntityId and Cell are both `number`, so tag them. */
type UseOnTarget = { kind: 'entity'; id: EntityId } | { kind: 'cell'; cell: Cell };

// Declaration merge into the engine's ActionMap (the seam under test).
declare module '../../src/core/action' {
  interface ActionMap {
    useOn: { type: 'useOn'; actor: EntityId; item?: EntityId; target: UseOnTarget };
  }
}

/** The merged, strongly-typed variant — extracted cleanly from the Action union. */
type UseOn = Extract<Action, { type: 'useOn' }>;

describe('useOn declaration-merge seam (§7.2, R5)', () => {
  it('types the merged variant (no any) and enforces the discriminated target', () => {
    const ok: UseOn = { type: 'useOn', actor: 'p', target: { kind: 'cell', cell: 5 } };
    expect(ok.target.kind).toBe('cell');
    // @ts-expect-error — a bare number is not a valid (discriminated) target
    const bad: UseOn = { type: 'useOn', actor: 'p', target: 5 };
    void bad;
  });

  it('runs client→decode→enqueue→resolve for a game-registered useOn handler', () => {
    const w = makeWorld();
    const lvl = makeLevel('L', 3, 1);
    w.state.levels.set('L', lvl);
    spawnAt(w, 'p', 'L', 0, 0);

    // The game's handler: a "welder" useOn a cell swaps it to a sealed tile.
    w.services.tiles.register({ id: 'patch', walkable: false, transparent: false, glyph: 'P', fg: '#999' });
    const useOn: ActionHandler = (ctx) => {
      const a = ctx.action as UseOn;
      if (a.target.kind !== 'cell') return void ctx.reject('useOn: need a cell');
      ctx.push(setTileEffect('L', a.target.cell, 'patch'));
    };
    (w.services.registries.handlers as Registry<ActionHandler>).register('useOn', useOn);

    // Transport seam: a sanitized client message decodes to a typed Action.
    const decode = (msg: { type: string; cell?: number }): Action | undefined =>
      msg.type === 'useOn' && typeof msg.cell === 'number'
        ? { type: 'useOn', actor: 'p', target: { kind: 'cell', cell: msg.cell } }
        : undefined;

    const action = decode({ type: 'useOn', cell: levelCell(lvl, 1, 0) })!;
    const out = perform(w, action);
    expect(out.status).toBe('done');
    expect(w.services.tiles.byIndex(0).id).not.toBe('patch'); // sanity: index 0 is wall
    expect(out.status === 'done' && out.events.some((e) => e.type === 'tile:changed')).toBe(true);
  });
});
