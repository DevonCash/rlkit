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
import { createQueries, type QueryIndex, type Queries } from './query';
import { createRegistry, type Registries } from './registry';

/**
 * Pending turns + delayed effects (§7.1). Placeholder in M1 — the unified
 * timeline (two clocks, scheduled effects) is built in milestone 2.
 */
export interface TimelineState {
  /** World-clock tick count; entries arrive with the M2 timeline. */
  clock: number;
}

export interface WorldState {
  entities: Map<EntityId, Entity>;
  levels: Map<string, Level>;
  timeline: TimelineState;
  rng: RNGState;
  turn: number;
}

export interface Services {
  bus: EventBus;
  queries: Queries;
  registries: Registries;
  rng: RNG;
  config: Config;
  // timeline: Timeline — added in milestone 2 (operates on state.timeline).
}

export interface World {
  state: WorldState;
  services: Services;
}

/** Read-only view of a world handed to upstream (non-effect) code. */
export type ReadonlyWorld = {
  readonly state: DeepReadonly<WorldState>;
  readonly services: Services;
};

type DeepReadonly<T> = T extends Map<infer K, infer V>
  ? ReadonlyMap<K, DeepReadonly<V>>
  : T extends (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export interface CreateWorldOptions {
  config: Config;
  /**
   * The seeded RNG to drive the world. Required and injected here: defaulting
   * to a concrete (pure-rand) implementation is an adapter concern and happens
   * at the public edge (`src/index.ts`), keeping the core adapter-free.
   */
  rng: RNG;
  /** Extra registries to merge in beyond the engine defaults. */
  registries?: Registries;
}

/**
 * Wire a minimal world: services (bus, queries, registries, rng) over empty
 * state. Spawning, levels, and the timeline loop are layered on in later
 * milestones; this is the construction seam they build against.
 */
export function createWorld(opts: CreateWorldOptions): World {
  const rng: RNG = opts.rng;

  const entities = new Map<EntityId, Entity>();
  const levels = new Map<string, Level>();
  const queries: QueryIndex = createQueries(entities);

  const registries: Registries = {
    components: createRegistry('component'),
    mixins: createRegistry('mixin'),
    blueprints: createRegistry('blueprint'),
    tiles: createRegistry('tile'),
    ...opts.registries,
  };

  const state: WorldState = {
    entities,
    levels,
    timeline: { clock: 0 },
    rng: rng.getState(),
    turn: 0,
  };

  const services: Services = {
    bus: createEventBus(),
    queries,
    registries,
    rng,
    config: opts.config,
  };

  return { state, services };
}
