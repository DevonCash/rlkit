/**
 * flags — the tile-flag registry + the composed-flag index types (§8.1).
 *
 * A *flag* is a boolean spatial property of a cell, composed from the tile type
 * AND any occupying entities. `walkable`/`transparent` are the two core flags
 * (bits 0,1 — the lingua franca the FOV/pathfinding adapters and the field
 * passable/transparent closures depend on); games register more (`airtight`,
 * `wire`, `pipe`, …) on top. The `FlagRegistry` assigns each name a bit, exactly
 * as `TilePalette` assigns tiles an index.
 *
 * The per-level `FlagIndex` maintains a composed Uint16 `flags` layer
 * (`tile bits | OR(occupant bits)`) so the atmos stepper and the network index
 * read one packed layer. The index *impl* is sim-only (`sim/flags.ts`); these
 * types live in core so `Services` can name the manager without importing sim
 * (the `FieldManager`/`Timeline` precedent).
 */
import type { Cell } from './coords';

/** The composed flag layer is Uint16, so at most 16 flags may be registered. */
export const MAX_FLAGS = 16;

/** Registry mapping flag names → bit indices (0-based), mirroring `TilePalette`. */
export interface FlagRegistry {
  /** Register a flag, assigning the next bit index; throws on duplicate / overflow. */
  register(name: string): number;
  /** Bit index for a flag name (throws if unknown). */
  bit(name: string): number;
  has(name: string): boolean;
  /** Combined bitmask for a set of flag names. */
  mask(names: Iterable<string>): number;
  /** Registered flag names in bit order. */
  names(): string[];
  readonly size: number;
}

export function createFlagRegistry(): FlagRegistry {
  const bits = new Map<string, number>();
  const order: string[] = [];

  const reg: FlagRegistry = {
    register(name) {
      if (bits.has(name)) throw new Error(`FlagRegistry: flag "${name}" already registered`);
      if (order.length >= MAX_FLAGS) {
        throw new Error(`FlagRegistry: cannot register "${name}" — exceeds ${MAX_FLAGS} flags`);
      }
      const b = order.length;
      bits.set(name, b);
      order.push(name);
      return b;
    },
    bit(name) {
      const b = bits.get(name);
      if (b === undefined) throw new Error(`FlagRegistry: unknown flag "${name}"`);
      return b;
    },
    has: (name) => bits.has(name),
    mask(names) {
      let m = 0;
      for (const n of names) m |= 1 << reg.bit(n);
      return m;
    },
    names: () => [...order],
    get size() {
      return order.length;
    },
  };

  // The two core flags — bits 0,1 — pre-registered so they are always present.
  reg.register('walkable');
  reg.register('transparent');
  return reg;
}

/**
 * Per-level composed-flag index: owns the maintained `flags` Uint16 layer
 * (`palette.flagBits(tile) | OR(occupant tileFlags bits)`), kept current
 * incrementally off `tile:changed` + movement events, emitting `flags:changed`
 * when a cell's mask shifts.
 */
export interface FlagIndex {
  /** Composed flag mask at a cell. */
  flagsAt(cell: Cell): number;
  /** Whether a cell carries a named flag (composed). */
  hasFlagAt(cell: Cell, name: string): boolean;
  /** The raw composed layer (current) — for hot loops (e.g. the atmos stepper). */
  layer(): Uint16Array;
  /**
   * Recompute one cell after a game-driven flag-component mutation that emits no
   * movement/tile event (e.g. an entity-based door toggling `airtight` in place);
   * emits `flags:changed` if the mask changed.
   */
  invalidateCell(cell: Cell): void;
  /** Unsubscribe from the bus (level teardown). */
  dispose(): void;
}

export interface FlagManager {
  forLevel(levelId: string): FlagIndex;
}
