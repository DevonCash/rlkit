/**
 * tile-effect — `setTile` as a first-class pipeline effect (§8.1, R2).
 *
 * Swapping a tile changes the world for every system at once — sight lines,
 * pathing, AI fields, and the composed `flags` layer. `setTileEffect` validates
 * and applies through the normal effect pipeline like any mutation, and emits a
 * `tile:changed { levelId, cell, from, to }` event so the standard invalidation
 * consumers (fields' `invalidateOn`, the flag index, FOV recompute) react.
 */
import type { Cell } from './coords';
import type { Effect } from './action';
import { setTile, tileIndexAt } from './level';

/** An effect that swaps the tile at `cell` to `toTileId`, emitting `tile:changed`. */
export function setTileEffect(levelId: string, cell: Cell, toTileId: string): Effect {
  return {
    kind: 'set-tile',
    validate(world) {
      const level = world.state.levels.get(levelId);
      if (!level || cell < 0 || cell >= level.width * level.height) return false;
      return world.services.tiles.has(toTileId);
    },
    apply(world) {
      const level = world.state.levels.get(levelId)!;
      const to = world.services.tiles.index(toTileId);
      const from = tileIndexAt(level, cell);
      setTile(level, cell, to);
      return from === to ? [] : [{ type: 'tile:changed', levelId, cell, from, to }];
    },
  };
}
