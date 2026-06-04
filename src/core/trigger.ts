/**
 * trigger — persisted trigger/zone state types (§11A.5).
 *
 * Place-scoped reactivity is expressed as DATA (`event → testId → effectId`),
 * the same reactor model mixins use at entity scope. Three scopes:
 *   - tile: stateless rules keyed by tile-type id (content, NOT serialized; see
 *           `TileTrigger` + the `tileTriggers` registry in `sim/triggers.ts`).
 *   - cell: a placed instance at one cell.
 *   - zone: a placed instance over a named cell-set (promoted from mapgen regions).
 *
 * Cell/zone instances and zones live in `WorldState.triggers` and serialize;
 * `testId`/`effectId` are registry ids (serialize-by-name). These are plain
 * interfaces (the one canonical declaration); `content/validate.ts` carries the
 * Zod validators. Core-only: imports just `./coords`.
 */
import type { Cell } from './coords';

/** A named cell-set on a level (promoted from a mapgen region). */
export interface Zone {
  id: string;
  levelId: string;
  cells: Cell[];
  data?: Record<string, unknown> | undefined;
}

/** Placed-trigger scopes (tile-type rules are stateless content, not instances). */
export type TriggerScope = 'cell' | 'zone';

/** A placed trigger: a reactor rule attached to a cell or a zone, with state. */
export interface TriggerInstance {
  id: string;
  /** Event type to react to, e.g. 'entity:entered'. */
  on: string;
  scope: TriggerScope;
  levelId: string;
  /** scope==='cell': the cell this is attached to. */
  cell?: Cell | undefined;
  /** scope==='zone': the zone id this is attached to. */
  zoneId?: string | undefined;
  /** Optional predicate (trigger-test registry id) gating the fire. */
  testId?: string | undefined;
  /** Trigger-effect registry id run when it fires. */
  effectId: string;
  /** Fire at most once, then deactivate. */
  once?: boolean | undefined;
  /** Bookkeeping: set true after a `once` trigger fires (serialized). */
  fired?: boolean | undefined;
  /** Config passed to the effect (e.g. trap delay/amount). */
  data?: Record<string, unknown> | undefined;
}

/** A stateless rule attached to a tile TYPE (every tile of that id). */
export interface TileTrigger {
  on: string;
  testId?: string | undefined;
  effectId: string;
  data?: Record<string, unknown> | undefined;
}

/** The serializable trigger/zone store carried in `WorldState`. */
export interface TriggerState {
  zones: Zone[];
  triggers: TriggerInstance[];
}

/** A fresh, empty trigger store. */
export function emptyTriggerState(): TriggerState {
  return { zones: [], triggers: [] };
}
