/**
 * network — a reusable cell-network connectivity index (§6, R3).
 *
 * "Is this cell connected to that one over a marked layer?" — wires now, pipes
 * later. A per-level service maintains connected components (4- or 8-neighbor)
 * over a membership predicate and answers `networkOf(cell)` / `sameNetwork(a, b)`
 * cheaply. Membership is **flag-backed by default** (a registered flag on the
 * composed `flags` layer, so it composes tile + entity contributions for free and
 * invalidates off `flags:changed`), with a raw-`layer` escape hatch.
 *
 * Component ids are the **minimum member cell** of the component (via
 * `labelComponents`) — purely state-derived, so they are identical after
 * save/load with nothing serialized. Maintenance is lazy full relabel on dirty
 * (coalesced); the dirty signal is keyed off the per-cell change event so an
 * incremental upgrade later is internal-only. A SERVICE, not serialized; the game
 * re-creates the manager on load (like the field/flag managers).
 */
import type { Cell } from '../core/coords';
import { labelComponents } from '../core/graph';
import type { World } from '../core/world';
import type { Level } from '../core/level';
import type { GameEvent } from '../core/events';

export interface NetworkDescriptor {
  id: string;
  /** Flag-backed membership: `member = (flags[cell] & bit(flag)) !== 0` (default path). */
  flag?: string;
  /** Raw-layer escape hatch: `member = layer[cell] !== 0`. Mutually exclusive with `flag`. */
  layer?: string;
  /** Event types that dirty this index. Defaults to `['flags:changed']` for flag-backed. */
  invalidateOn?: string[];
  /** 8-neighbor connectivity instead of 4. */
  diagonals?: boolean;
}

export interface NetworkIndex {
  /** Register a network by descriptor (idempotent); first query computes it. */
  ensure(desc: NetworkDescriptor): void;
  /** Component representative (min member cell) of `cell`, or -1 if not a member. */
  networkOf(id: string, cell: Cell): Cell;
  /** Whether two cells are members of the same component. */
  sameNetwork(id: string, a: Cell, b: Cell): boolean;
  /** Force a recompute on the next query. */
  markDirty(id: string): void;
  dispose(): void;
}

export interface NetworkManager {
  forLevel(levelId: string): NetworkIndex;
  /** Dispose a level's index (unsubscribe) and drop it — call on level teardown. */
  disposeLevel(levelId: string): void;
}

function createNetworkIndex(world: World, level: Level): NetworkIndex {
  const n = level.width * level.height;
  const descs = new Map<string, NetworkDescriptor>();
  const labels = new Map<string, Int32Array>();
  const dirty = new Set<string>();
  const unsubs: Array<() => void> = [];

  const memberOf = (desc: NetworkDescriptor): ((cell: Cell) => boolean) => {
    if (desc.flag !== undefined) {
      const layer = world.services.flagIndex.forLevel(level.id).layer();
      const bit = 1 << world.services.flags.bit(desc.flag);
      return (c) => (layer[c]! & bit) !== 0;
    }
    const layer = level.layers.get(desc.layer!);
    if (!layer) return () => false;
    return (c) => layer[c] !== 0;
  };

  const relabel = (id: string): Int32Array => {
    const desc = descs.get(id)!;
    const out = labelComponents(level.width, level.height, n, memberOf(desc), desc.diagonals ?? false);
    labels.set(id, out);
    dirty.delete(id);
    return out;
  };

  const labelsOf = (id: string): Int32Array => {
    if (!descs.has(id)) throw new Error(`NetworkIndex: network "${id}" was not ensure()'d`);
    return dirty.has(id) || !labels.has(id) ? relabel(id) : labels.get(id)!;
  };

  return {
    ensure(desc) {
      if (descs.has(desc.id)) return;
      descs.set(desc.id, desc);
      dirty.add(desc.id);
      const events = desc.invalidateOn ?? (desc.flag !== undefined ? ['flags:changed'] : []);
      for (const ev of events) {
        unsubs.push(
          world.services.bus.on(ev, (e: GameEvent) => {
            if ((e as { levelId?: unknown }).levelId === undefined || (e as { levelId?: unknown }).levelId === level.id) {
              dirty.add(desc.id);
            }
          }),
        );
      }
    },
    networkOf(id, cell) {
      return labelsOf(id)[cell] ?? -1;
    },
    sameNetwork(id, a, b) {
      const l = labelsOf(id);
      return l[a] !== -1 && l[a] === l[b];
    },
    markDirty(id) {
      dirty.add(id);
    },
    dispose() {
      for (const u of unsubs) u();
      unsubs.length = 0;
    },
  };
}

/** Create a per-world network manager (one index per level, lazily). */
export function createNetworkManager(world: World): NetworkManager {
  const stores = new Map<string, NetworkIndex>();
  return {
    forLevel(levelId) {
      let store = stores.get(levelId);
      if (!store) {
        const level = world.state.levels.get(levelId);
        if (!level) throw new Error(`NetworkManager: unknown level "${levelId}"`);
        store = createNetworkIndex(world, level);
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
