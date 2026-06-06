/**
 * flags — the composed-flag index (§8.1).
 *
 * One `FlagIndex` per level maintains a Uint16 `flags` layer whose every cell is
 * `palette.flagBits(tile) | OR(occupant tileFlags bits)`. Built fully on creation
 * (and on load), then kept current incrementally off `tile:changed` (tile portion)
 * and `entity:entered`/`entity:exited` (occupant portion). When a cell's composed
 * mask actually changes it emits `flags:changed { levelId, cell, before, after }`,
 * so consumers (the network index, UI) react to the *result* rather than the cause.
 *
 * A SERVICE (subscriptions, the layer-as-cache) — not serialized; the `flags`
 * layer is a transient layer rebuilt on first `forLevel` post-load. Mirrors
 * `createFieldManager`.
 */
import type { Cell } from '../core/coords';
import type { FlagManager, FlagIndex } from '../core/flags';
import type { World } from '../core/world';
import { ensureU16Layer, tileIndexAt, type Level } from '../core/level';
import { get } from '../core/entity';
import type { TileFlags } from '../core/component';
import type { GameEvent } from '../core/events';

/** The canonical composed-flag layer name (a transient layer — see storage codec). */
export const FLAGS_LAYER = 'flags';

function createFlagIndex(world: World, level: Level): FlagIndex {
  const n = level.width * level.height;
  const palette = world.services.tiles;
  const flags = world.services.flags;
  const bus = world.services.bus;
  const queries = world.services.queries;
  const layer = ensureU16Layer(level, FLAGS_LAYER);
  const unsubs: Array<() => void> = [];

  const occupantBits = (cell: Cell): number => {
    let m = 0;
    for (const id of queries.at(cell, level.id)) {
      const e = world.state.entities.get(id);
      const tf = e && get<TileFlags>(e, 'tileFlags');
      if (tf) m |= flags.mask(tf.flags);
    }
    return m;
  };

  const maskAt = (cell: Cell): number =>
    (palette.flagBits(tileIndexAt(level, cell)) | occupantBits(cell)) & 0xffff;

  const recompute = (cell: Cell, emit = true): void => {
    const next = maskAt(cell);
    const prev = layer[cell]!;
    if (prev === next) return;
    layer[cell] = next;
    if (emit) bus.emit({ type: 'flags:changed', levelId: level.id, cell, before: prev, after: next });
  };

  // Subscribe to the cell-carrying, level-scoped events; recompute the touched cell.
  const onCell = (handler: (cell: Cell) => void) => (ev: GameEvent) => {
    const e = ev as { levelId?: unknown; cell?: unknown };
    if (e.levelId === level.id && typeof e.cell === 'number') handler(e.cell);
  };
  unsubs.push(bus.on('tile:changed', onCell((c) => recompute(c))));
  unsubs.push(bus.on('entity:entered', onCell((c) => recompute(c))));
  unsubs.push(bus.on('entity:exited', onCell((c) => recompute(c))));

  // Full build now (captures current tiles + occupants); no events on the build.
  for (let c = 0; c < n; c++) layer[c] = maskAt(c);

  return {
    flagsAt: (cell) => layer[cell]!,
    hasFlagAt: (cell, name) => (layer[cell]! & (1 << flags.bit(name))) !== 0,
    layer: () => layer,
    invalidateCell: (cell) => recompute(cell),
    dispose() {
      for (const u of unsubs) u();
      unsubs.length = 0;
    },
  };
}

/** Create the per-world composed-flag manager (one index per level, lazily). */
export function createFlagManager(world: World): FlagManager {
  const stores = new Map<string, FlagIndex>();
  return {
    forLevel(levelId) {
      let store = stores.get(levelId);
      if (!store) {
        const level = world.state.levels.get(levelId);
        if (!level) throw new Error(`FlagManager: unknown level "${levelId}"`);
        store = createFlagIndex(world, level);
        stores.set(levelId, store);
      }
      return store;
    },
    disposeLevel(levelId) {
      const store = stores.get(levelId);
      if (store) {
        store.dispose();
        stores.delete(levelId);
      }
    },
  };
}
