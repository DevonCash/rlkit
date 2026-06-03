/**
 * rlkit — public API surface (§18).
 *
 * The headless core is built milestone-by-milestone (§20) behind this entry
 * point. This module is the composition edge: it may wire concrete adapters
 * (e.g. the pure-rand RNG) that the core itself must not import.
 */
import { createWorld as assembleWorld } from './core/world';
import type { World, CreateWorldOptions } from './core/world';
import { makeRng } from './adapters/rng';
import { createTimeline } from './sim/timeline';
import type { RNG } from './core/rng';
import type { Config } from './config/defaults';
import type { Registries } from './core/registry';

export const version = '0.0.0';

// --- config ----------------------------------------------------------------
export type { Config } from './config/defaults';
export { defaultConfig } from './config/defaults';

// --- coords (§8.1) ---------------------------------------------------------
export type { Cell, Point } from './core/coords';
export {
  cellOf,
  pointOf,
  xOf,
  yOf,
  inBounds,
  keyOf,
  neighbors4,
  neighbors8,
  DIRS4,
  DIRS8,
} from './core/coords';

// --- rng (§11.1) -----------------------------------------------------------
export type { RNG, RNGState } from './core/rng';
export { makeRng } from './adapters/rng';

// --- content utilities (§11A.6, §11A.7) ------------------------------------
export { roll } from './core/dice';
export { pick, type WeightedTable } from './core/weighted';

// --- registries / components / entities (§5–6) -----------------------------
export { createRegistry } from './core/registry';
export type { Registry, Registries } from './core/registry';
export {
  createComponentRegistry,
  registerCoreComponents,
  parseComponent,
  Position,
  Renderable,
} from './core/component';
export type { Component, ComponentDef, ComponentRegistry } from './core/component';
export {
  createEntity,
  get,
  has,
  set,
  remove,
} from './core/entity';
export type { Entity, EntityId } from './core/entity';
export { TagIndex, Tagged } from './core/tags';

// --- queries / events / level (§6.1, §7.2, §8.1) ---------------------------
export { createQueries, QueryIndex } from './core/query';
export type { Queries } from './core/query';
export { createEventBus } from './core/events';
export type { GameEvent, EventBus, EventListener } from './core/events';
export type { Level, TileType, Layer } from './core/level';

// --- action / effect / reactor / mixin spine (§7.2, §7.3, §5.3) ------------
export type {
  Action,
  CoreAction,
  Effect,
  ActionContext,
  ActionOutcome,
  ActionHandler,
  TimerEffect,
} from './core/action';
export type {
  Reactor,
  ReactorScope,
  ReactorPhase,
  ReactionCtx,
  EventReactionCtx,
  ReactorRegistry,
} from './core/reactor';
export { createReactorRegistry } from './core/reactor';
export type { Mixin, MixinRegistry } from './core/mixin';
export { createMixinRegistry, resolveMixins } from './core/mixin';

// --- world + timeline (§6.0, §7.1) -----------------------------------------
export type {
  World,
  WorldState,
  Services,
  ReadonlyWorld,
  TimelineState,
  Timeline,
  Entry,
  TimerId,
} from './core/world';
export { emptyTimelineState } from './core/world';
export { createTimeline } from './sim/timeline';

/** Options for the public {@link createWorld}: a seed or a prebuilt RNG. */
export interface WorldOptions {
  config: Config;
  /** A numeric seed (reproducible) or a prebuilt RNG. Defaults to seed 0. */
  rng?: RNG | number;
  registries?: Registries;
}

/**
 * Create a world, defaulting the RNG to the pure-rand-backed implementation.
 * Pass a numeric `rng` seed for reproducible runs, or your own `RNG`.
 */
export function createWorld(opts: WorldOptions): World {
  const rng: RNG = typeof opts.rng === 'object' ? opts.rng : makeRng(opts.rng ?? 0);
  const core: CreateWorldOptions = {
    config: opts.config,
    rng,
    makeTimeline: createTimeline,
    ...(opts.registries ? { registries: opts.registries } : {}),
  };
  return assembleWorld(core);
}
