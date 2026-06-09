/**
 * registry — the one generic extensible structure (§6.3).
 *
 * Components, mixins, blueprints, tiles, effects, statuses, generators — every
 * extensible kind is a `Registry<T>`. This is the backbone of the
 * serialize-by-name rule: state stores ids, and load looks each id up here to
 * reattach the live definition. Do not add parallel registry types.
 */

export interface Registry<T> {
  register(id: string, def: T): void;
  /** Register or replace by id — the intentional way for content to override a built-in. */
  override(id: string, def: T): void;
  get(id: string): T;
  /** Non-throwing lookup. */
  tryGet(id: string): T | undefined;
  has(id: string): boolean;
  /** Registered ids in insertion order (stable iteration). */
  ids(): string[];
}

/**
 * The bag of all registries carried by a World's services.
 *
 * Kept deliberately type-erased: core defines this map but the concrete element
 * types (`StatDef`, `MapGenerator`, …) live in `sim`/`mapgen`, which core may
 * not import (the layering rule). Consumers read a registry through the typed
 * accessor co-located with its element type (e.g. `statRegistryOf` in
 * `sim/stats.ts`), which centralizes the one `Registry<unknown>` → concrete cast.
 */
export type Registries = { [kind: string]: Registry<unknown> };

/**
 * Create an empty registry. `kind` is used only to make error messages clear.
 * Re-registering an existing id throws (content collisions are bugs, not
 * silent overwrites).
 */
export function createRegistry<T>(kind = 'item'): Registry<T> {
  const defs = new Map<string, T>();
  return {
    register(id, def) {
      if (defs.has(id)) {
        throw new Error(`Registry(${kind}): id "${id}" already registered`);
      }
      defs.set(id, def);
    },
    override(id, def) {
      defs.set(id, def);
    },
    get(id) {
      const def = defs.get(id);
      if (def === undefined) {
        throw new Error(`Registry(${kind}): unknown id "${id}"`);
      }
      return def;
    },
    tryGet(id) {
      return defs.get(id);
    },
    has(id) {
      return defs.has(id);
    },
    ids() {
      return [...defs.keys()];
    },
  };
}
