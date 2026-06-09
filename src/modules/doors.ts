/**
 * doorsModule — openable doors (opt-in §6.4).
 *
 * Doors are two tile states: `door_closed` (blocks movement + sight) and
 * `door_open` (passes both). Because walkability/transparency are read straight
 * off the tile, FOV and pathing update for free once a door opens. An explicit
 * `open` action swaps a targeted closed door; and a global `pre` reactor on
 * `move` makes bumping a closed door open it (it pushes the open effect onto the
 * bump and charges a turn) — classic bump-to-open without forking the move handler.
 */
import { get } from '../core/entity';
import type { Position } from '../core/component';
import { handlerRegistryOf, type Effect, type ActionContext, type ActionHandler } from '../core/action';
import type { Reactor } from '../core/reactor';
import type { Module } from '../core/module';
import { cellOf } from '../core/coords';
import { tileAt } from '../core/level';
import { setTileEffect } from '../core/tile-effect';

const CLOSED = { id: 'door_closed', walkable: false, transparent: false, glyph: '+', fg: '#b85' };
const OPEN = { id: 'door_open', walkable: true, transparent: true, glyph: "'", fg: '#b85' };

/**
 * Swap a closed door to open (no-op via validate if it isn't a closed door).
 * Delegates the tile swap to the core `setTileEffect` so `tile:changed` fires for
 * fields/FOV/flag-index invalidation, then adds the door's own `door:opened`.
 */
function openDoorEffect(levelId: string, cell: number): Effect {
  const swap = setTileEffect(levelId, cell, 'door_open');
  return {
    kind: 'open-door',
    validate: (w) => {
      const l = w.state.levels.get(levelId);
      return !!l && tileAt(l, cell, w.services.tiles).id === 'door_closed';
    },
    apply: (world) => [...swap.apply(world), { type: 'door:opened', cell, levelId }],
  };
}

export function doorsModule(): Module {
  const open: ActionHandler = (ctx: ActionContext) => {
    const target = (ctx.action as { target?: number }).target;
    const actor = ctx.world.state.entities.get(ctx.action.actor);
    const pos = actor && get<Position>(actor, 'position');
    if (!pos || typeof target !== 'number') return void ctx.reject('open: no target');
    const level = ctx.world.state.levels.get(pos.levelId);
    if (!level || tileAt(level, target, ctx.world.services.tiles).id !== 'door_closed') {
      return void ctx.reject('open: not a closed door');
    }
    ctx.push(openDoorEffect(pos.levelId, target));
  };

  // Bump-to-open: stepping into a closed door opens it (and spends the turn).
  const onMove: Reactor = {
    on: 'move',
    scope: 'global',
    phase: 'pre',
    react(ctx) {
      const c = ctx as ActionContext;
      const dir = (c.action as { dir?: { x: number; y: number } }).dir;
      const actor = c.world.state.entities.get(c.action.actor);
      const pos = actor && get<Position>(actor, 'position');
      if (!pos || !dir) return;
      const level = c.world.state.levels.get(pos.levelId);
      if (!level) return;
      const tx = pos.x + dir.x;
      const ty = pos.y + dir.y;
      if (tx < 0 || tx >= level.width || ty < 0 || ty >= level.height) return;
      const cell = cellOf({ x: tx, y: ty }, level.width);
      if (tileAt(level, cell, c.world.services.tiles).id === 'door_closed') {
        c.push(openDoorEffect(pos.levelId, cell));
        c.cost = c.world.services.config.baseActionCost; // opening is a full turn, not a free bump
      }
    },
  };

  return {
    id: 'doors',
    setup(world) {
      const tiles = world.services.tiles;
      if (!tiles.has(CLOSED.id)) tiles.register(CLOSED);
      if (!tiles.has(OPEN.id)) tiles.register(OPEN);
      handlerRegistryOf(world).register('open', open);
      world.services.reactors.register(onMove);
    },
  };
}
