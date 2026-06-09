/**
 * fields — the field-system abstraction types (§11.3.1, §11.3.4).
 *
 * A field is a per-level scalar grid (a Float32 layer in the Level's layered
 * grid, §8.1) that AI reads to decide where to move. Goal (Dijkstra), scent,
 * and influence are the same data structure with different update rules, so they
 * share one storage layer and `DesireAI` consumes any of them uniformly.
 *
 * These are *types only* and live in `core` so `Services.fields` can name the
 * `FieldManager`/`FieldStore` without importing `sim` (the `Timeline`/
 * `FovProvider` precedent). The store impl, producers, and concrete `params`
 * shapes are sim-only.
 */
import type { Cell } from './coords';
import type { RNG } from './rng';
import type { Registry } from './registry';
import type { ReadonlyWorld } from './world';

export type FieldId = string;
export type FieldKind = 'goal' | 'scent' | 'influence';

export interface FieldDescriptor<P = unknown> {
  id: FieldId;
  kind: FieldKind;
  params: P;
  diagonals?: boolean;
  /** Event types that dirty this field (goal/influence). */
  invalidateOn?: string[];
  /** Ticks every turn (scent, decaying influence). */
  perTurn?: boolean;
  /** Computed once, then never updated (hazard-escape). */
  static?: boolean;
}

export type FieldRegistry = Registry<FieldDescriptor>;

/** Typed view of the field registry (centralizes the one downcast). */
export function fieldRegistryOf(world: ReadonlyWorld): FieldRegistry {
  return world.services.registries.fields as FieldRegistry;
}

/**
 * Context handed to a producer: grid geometry, passability/transparency tests
 * (packed-cell indexed), the resolved goal/source cells, a reusable scratch
 * buffer (so producers never allocate per update), and the RNG.
 */
export interface FieldCtx {
  readonly width: number;
  readonly height: number;
  readonly diagonals: boolean;
  passable(cell: Cell): boolean;
  transparent(cell: Cell): boolean;
  /** The resolved goal/source cells for this field (from its `params`). */
  goalCells(): Iterable<Cell>;
  /** A reusable `width*height` scratch array (e.g. scent double-buffer). */
  scratch(): Float32Array;
  readonly rng: RNG;
}

/** A producer writes into a caller-owned Float32Array — never allocates per update. */
export interface FieldProducer<P = unknown> {
  kind: FieldKind;
  recompute(out: Float32Array, ctx: FieldCtx, params: P): void;
  step?(out: Float32Array, ctx: FieldCtx, params: P): void;
}

export interface Desire {
  fieldId: FieldId;
  weight: number;
}
export type DesireProfile = Desire[];

/** One per Level. Owns descriptors, dirty flags, the composite cache, scratch. */
export interface FieldStore {
  /** Register a field by id (idempotent); first read computes it. */
  ensure(desc: FieldDescriptor): void;
  /** The raw grid for a field (recomputed if dirty). */
  data(id: FieldId): Float32Array;
  /** Weighted sum of the profile's fields, cached until a contributing field changes. */
  composite(profile: DesireProfile): Float32Array;
  /** Best (lowest-value) passable neighbor cell of `cell`, or -1. */
  bestStep(field: Float32Array, cell: Cell, diagonals?: boolean): number;
  markDirty(id: FieldId): void;
  /** Update perTurn fields (and recompute dirty ones lazily). */
  tick(): void;
  /** Unsubscribe from the bus (level teardown). */
  dispose(): void;
}

export interface FieldManager {
  forLevel(levelId: string): FieldStore;
}
