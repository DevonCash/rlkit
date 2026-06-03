/**
 * ai/simple — the batteries-included simple AI mixins (§11.2).
 *
 * `aiHunter` chases the nearest visible hostile, stepping via the PathProvider
 * and emitting `move` so walking into the target becomes an attack (the move
 * handler dispatches relocate/swap/attack/bump).
 * `aiWanderer` takes a random walkable step. Both implement `Mixin.takeTurn`;
 * `undefined` declines so the next AI mixin (or the driver's `wait`) takes over.
 * For richer behavior, the field-based `DesireAI` (M6b) replaces these.
 */
import { get, type Entity } from '../../core/entity';
import type { Position } from '../../core/component';
import type { Mixin } from '../../core/mixin';
import type { Action } from '../../core/action';
import { DIRS4, cellOf } from '../../core/coords';
import { isWalkable } from '../../core/level';
import type { ReadonlyWorld } from '../../core/world';
import { nearestHostile, pathToward } from './helpers';

export const aiHunterMixin: Mixin = {
  name: 'aiHunter',
  requires: ['position', 'allegiance'],
  takeTurn(self: Entity, world: ReadonlyWorld): Action | undefined {
    const sp = get<Position>(self, 'position');
    if (!sp) return undefined;
    const target = nearestHostile(world, self);
    const tp = target && get<Position>(target, 'position');
    if (!target || !tp) return undefined; // nothing to hunt → decline
    const level = world.state.levels.get(sp.levelId);
    if (!level) return undefined;
    const step = pathToward(world, level, { x: sp.x, y: sp.y }, { x: tp.x, y: tp.y });
    if (!step || (step.x === 0 && step.y === 0)) return undefined;
    // move: walks into a free cell, or attacks/swaps the occupant (the move
    // handler dispatches — walking into the target becomes an attack).
    return { type: 'move', actor: self.id, dir: step };
  },
};

export const aiWandererMixin: Mixin = {
  name: 'aiWanderer',
  requires: ['position'],
  takeTurn(self: Entity, world: ReadonlyWorld): Action | undefined {
    const sp = get<Position>(self, 'position');
    if (!sp) return undefined;
    const level = world.state.levels.get(sp.levelId);
    if (!level) return undefined;
    const palette = world.services.tiles;
    const options = DIRS4.filter((d) => {
      const nx = sp.x + d.x;
      const ny = sp.y + d.y;
      if (nx < 0 || nx >= level.width || ny < 0 || ny >= level.height) return false;
      return isWalkable(level, cellOf({ x: nx, y: ny }, level.width), palette);
    });
    if (options.length === 0) return undefined;
    const dir = world.services.rng.pick(options);
    return { type: 'move', actor: self.id, dir };
  },
};
