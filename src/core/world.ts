/**
 * world — `World = state + services` (§6.0).
 *
 * Only `WorldState` serializes (the save file, §16); `Services` are
 * reconstructed from registries on load and never serialized. This split is
 * what makes save/load and the future `fork()` (AI lookahead) fall out
 * naturally — copy `state`, share `services`. Upstream code receives a
 * `ReadonlyWorld`; only effects mutate state (enforced at the type level now,
 * with the runtime guard arriving alongside the effect pipeline in M2).
 */
import type { Config } from '../config/defaults';
import type { Entity, EntityId } from './entity';
import type { Level } from './level';
import type { RNG, RNGState } from './rng';
import type { EventBus } from './events';
import { createEventBus } from './events';
import { createQueries, type QueryIndex } from './query';
import { createRegistry, type Registries } from './registry';
import { createReactorRegistry, type ReactorRegistry } from './reactor';
import { createTilePalette, type TilePalette } from './tiles';
import type { FovProvider } from './fov';
import type { PathProvider } from './path';
import type { FieldManager } from './fields';
import { emptyTriggerState, type TriggerState } from './trigger';

/** A one-shot delayed effect scheduled on the world clock (§7.1). */
export type TimerId = number;

/**
 * Serializable timeline state (§7.1): actor turns (recurring, energy-based) and
 * one-shot delayed effects, plus both clocks. Stored as arrays (insertion
 * order, devalue-friendly); the `Timeline` service sorts deterministically on
 * read. Effects are referenced by `effectId` (serialize-by-name, §6.3).
 */
export interface TimelineState {
  /** World clock — advances once per global turn (§7.3). */
  worldClock: number;
  actors: { id: EntityId; energy: number; speed: number; clock: number }[];
  timers: { fireAt: number; effectId: string; payload?: unknown; seq: TimerId }[];
  /** Monotonic counter for deterministic timer tie-breaking + ids. */
  nextSeq: number;
}

/** The next entry due on the timeline. */
export type Entry =
  | { kind: 'actor'; id: EntityId }
  | { kind: 'effect'; effectId: string; payload?: unknown };

/**
 * The timeline service — operates on `state.timeline`. The implementation lives
 * in `sim/timeline.ts`; this interface lives in core so `Services` can name it
 * without importing `sim` (the impl is injected at construction, like the RNG).
 */
export interface Timeline {
  addActor(id: EntityId, speed?: number): void;
  remove(id: EntityId): void;
  schedule(delay: number, effectId: string, payload?: unknown): TimerId;
  cancel(id: TimerId): void;
  /** The next entry due; advances the world clock as needed (does not spend energy). */
  next(): Entry;
  /** An actor acted: spend `cost` energy and advance its per-actor clock. */
  reschedule(id: EntityId, cost: number): void;
  /** Current world clock. */
  readonly worldClock: number;
  /** Per-actor clock for `id` (status/regen/cooldowns tick on this). */
  clockOf(id: EntityId): number;
}

export interface WorldState {
  entities: Map<EntityId, Entity>;
  levels: Map<string, Level>;
  timeline: TimelineState;
  rng: RNGState;
  turn: number;
  /** Monotonic counter minting deterministic entity ids (serialize-stable). */
  nextEntityId: number;
  /** Place-scoped reactors + zones (§11A.5); cell/zone instances persist here. */
  triggers: TriggerState;
}

export interface Services {
  bus: EventBus;
  /**
   * The query/index layer. Typed as the concrete `QueryIndex` (not just the
   * read-only `Queries`) because effects — the sole mutators of world state —
   * update the spatial/component indexes through its maintenance hooks.
   * Upstream code should use only the `Queries` read methods.
   */
  queries: QueryIndex;
  registries: Registries;
  /** Global/system reactors (entity reactors come from mixins — §7.3). */
  reactors: ReactorRegistry;
  /** Tile definitions + int↔id mapping for level grids (§8.1). */
  tiles: TilePalette;
  /** Field-of-view provider (rotJS behind the interface — §11.1). */
  fov: FovProvider;
  /** Pathfinding provider (rotJS behind the interface — §11.1). */
  path: PathProvider;
  /** Per-level field stores (goal/scent/influence — §11.3). */
  fields: FieldManager;
  rng: RNG;
  config: Config;
  timeline: Timeline;
}

export interface World {
  state: WorldState;
  services: Services;
}

/**
 * Read-only view handed to upstream (non-effect) code. Shallow by design: the
 * `state`/`services` references are read-only, and the mutation-through-effects
 * invariant is upheld by discipline + a runtime guard (only `Effect.apply` gets
 * a mutable `World`). A deep-frozen type was tried and rejected — it makes the
 * component accessors (`get`/`set`) unusable inside `validate` for no real
 * safety gain over the guard.
 */
export type ReadonlyWorld = {
  readonly state: WorldState;
  readonly services: Services;
};

export interface CreateWorldOptions {
  config: Config;
  /**
   * The seeded RNG to drive the world. Required and injected here: defaulting
   * to a concrete (pure-rand) implementation is an adapter concern and happens
   * at the public edge (`src/index.ts`), keeping the core adapter-free.
   */
  rng: RNG;
  /**
   * Factory for the `Timeline` service over `state.timeline`. Injected for the
   * same reason as the RNG: the implementation lives in `sim/timeline.ts` and
   * `core` may not import it. The public `createWorld` (`src/index.ts`) supplies
   * the default.
   */
  makeTimeline: (state: TimelineState, config: Config) => Timeline;
  /**
   * FOV + pathfinding providers (rotJS impls). Required here and injected: the
   * concrete adapters pull rotJS, which the core must not import. The public
   * `createWorld` (`src/index.ts`) supplies the rotJS defaults.
   */
  fov: FovProvider;
  path: PathProvider;
  /**
   * Factory for the per-level field manager. Injected (impl is sim-only) and
   * given the assembled `World` so field producers can resolve goal cells.
   */
  makeFields: (world: World) => FieldManager;
  /** Extra registries to merge in beyond the engine defaults. */
  registries?: Registries;
  /**
   * Reconstruct over an existing (deserialized) state instead of a fresh empty
   * one (§16, save/load). When given, services bind to THIS state from the
   * start (the query index, timeline, and field manager all capture `state`
   * references at construction), and the stale `state.rng` snapshot is kept
   * verbatim — the caller is responsible for `services.rng.setState(state.rng)`
   * and for rebuilding the query index from the restored entities.
   */
  initialState?: WorldState;
}

/** A fresh, empty timeline state. */
export function emptyTimelineState(): TimelineState {
  return { worldClock: 0, actors: [], timers: [], nextSeq: 0 };
}

/**
 * Wire a world: services (bus, queries, registries, rng, timeline) over empty
 * state. Spawning, levels, and the driver loop are layered on in later
 * milestones; this is the construction seam they build against.
 */
export function createWorld(opts: CreateWorldOptions): World {
  const rng: RNG = opts.rng;

  // Choose state first so services bind to the FINAL containers — when
  // reconstructing (`initialState`), the query index/timeline/fields must
  // capture the deserialized state, not a throwaway empty one. The fresh path
  // seeds `state.rng` from the rng; the restore path keeps the saved snapshot.
  const state: WorldState = opts.initialState ?? {
    entities: new Map<EntityId, Entity>(),
    levels: new Map<string, Level>(),
    timeline: emptyTimelineState(),
    rng: rng.getState(),
    turn: 0,
    nextEntityId: 0,
    triggers: emptyTriggerState(),
  };

  const queries: QueryIndex = createQueries(state.entities);

  const registries: Registries = {
    components: createRegistry('component'),
    mixins: createRegistry('mixin'),
    blueprints: createRegistry('blueprint'),
    generators: createRegistry('generator'),
    handlers: createRegistry('handler'),
    stats: createRegistry('stat'),
    resources: createRegistry('resource'),
    statuses: createRegistry('status'),
    consumableEffects: createRegistry('consumable-effect'),
    fields: createRegistry('field'),
    timerEffects: createRegistry('timer-effect'),
    triggerEffects: createRegistry('trigger-effect'),
    triggerTests: createRegistry('trigger-test'),
    tileTriggers: createRegistry('tile-trigger'),
    ...opts.registries,
  };

  const services: Services = {
    bus: createEventBus(),
    queries,
    registries,
    reactors: createReactorRegistry(),
    tiles: createTilePalette(),
    fov: opts.fov,
    path: opts.path,
    // The field manager needs the assembled World (to resolve goal cells), so it
    // is wired in just below once `world` exists.
    fields: undefined as unknown as FieldManager,
    rng,
    config: opts.config,
    timeline: opts.makeTimeline(state.timeline, opts.config),
  };

  const world: World = { state, services };
  services.fields = opts.makeFields(world);
  return world;
}
