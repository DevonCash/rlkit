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
import { makeRotFov } from './adapters/rot-fov';
import { makeRotPath } from './adapters/rot-path';
import { createTimeline } from './sim/timeline';
import { registerCoreHandlers } from './sim/handlers';
import { registerCoreTiles } from './core/tiles';
import { registerCoreComponents } from './core/component';
import { registerCoreStats, type StatDef } from './sim/stats';
import { registerCoreResources, type ResourceDef } from './sim/resources';
import { registerCoreStatuses, type StatusDef } from './sim/status';
import {
  equippableMixin,
  registerCoreConsumableEffects,
  type ConsumableEffectRegistry,
} from './sim/items';
import type { Mixin } from './core/mixin';
import { aiHunterMixin, aiWandererMixin } from './sim/ai/simple';
import { createFieldManager } from './sim/ai/field';
import { desireAiMixin } from './sim/ai/desire-ai';
import { diedReactor } from './sim/death';
import { bsp } from './mapgen/bsp';
import type { MapGenerator } from './mapgen/generator';
import type { ComponentRegistry } from './core/component';
import type { ActionHandler } from './core/action';
import type { Registry } from './core/registry';
import type { RNG } from './core/rng';
import type { FovProvider } from './core/fov';
import type { PathProvider } from './core/path';
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
  Blueprint,
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
export { createEventBus, createReactionLoop } from './core/events';
export type {
  GameEvent,
  EventBus,
  EventListener,
  ReactionLoop,
  ReactionLoopOptions,
} from './core/events';

// --- level + tiles (§8.1) --------------------------------------------------
export type { Level, TileType, Layer } from './core/level';
export {
  createLevel,
  tileAt,
  tileIndexAt,
  setTile,
  isWalkable,
  isTransparent,
  tilesLayer,
  levelCell,
  TILES_LAYER,
} from './core/level';
export type { TilePalette } from './core/tiles';
export { createTilePalette, registerCoreTiles } from './core/tiles';

// --- geometry / targeting (§11A.3) -----------------------------------------
export { line, hasLoS, cellsIn } from './core/geometry';
export type { Shape, CellsInOptions } from './core/geometry';

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

// --- resolve pipeline + handlers (§7.2, §7.4) ------------------------------
export { resolve, perform } from './sim/action';
export {
  registerCoreHandlers,
  moveHandler,
  waitHandler,
  bumpHandler,
  makeMoveEffect,
} from './sim/handlers';
export { runPreReactors, collectReactions } from './sim/reactors';

// --- map generation + spawn (§8.2, §5.4) -----------------------------------
export type {
  MapGenerator,
  GeneratorRegistry,
  GenParams,
  GeneratedMap,
  Region,
  Edge,
  SpawnHint,
} from './mapgen/generator';
export { createGeneratorRegistry } from './mapgen/generator';
export { bsp, generateBsp } from './mapgen/bsp';
export { decorate, entranceOf } from './mapgen/decorate';
export { reachableFrom, walkableCells } from './mapgen/reachability';
export { buildLevel } from './mapgen/build-level';
export type { BuildLevelParams, BuiltLevel } from './mapgen/build-level';
export { spawn } from './sim/spawn';
export type { SpawnOptions } from './sim/spawn';

// --- stats / resources / combat / status (§9) ------------------------------
export type { StatBlock, StatModifier } from './core/stats';
export { Stats, Resources, Statuses } from './core/component';
export { deriveStats, deriveStat, registerCoreStats } from './sim/stats';
export type { StatDef, StatDefRegistry } from './sim/stats';
export { changeResource, changeResourceEffect, registerCoreResources } from './sim/resources';
export type { ResourceDef, ResourceDefRegistry, ResourceEffect, Threshold } from './sim/resources';
export { defaultDamageFormula } from './sim/combat';
export type { DamageFormula, DamageResult } from './sim/combat';
export { applyStatusEffect, tickActor, registerCoreStatuses } from './sim/status';
export type { StatusDef, StatusDefRegistry } from './sim/status';
export { diedReactor } from './sim/death';

// --- items / inventory / equipment (§10) -----------------------------------
export { Item, Equipment, Consumable, Inventory, Equipped } from './core/component';
export {
  equippableMixin,
  registerCoreConsumableEffects,
  canCarry,
  effectiveCapacity,
  inventoryWeight,
} from './sim/items';
export type { ConsumableEffect, ConsumableEffectRegistry } from './sim/items';
export {
  pickupHandler,
  dropHandler,
  equipHandler,
  unequipHandler,
  useItemHandler,
} from './sim/handlers';

// --- FOV / AI / factions (§11.1, §11.2, §11A.2) ----------------------------
export type { FovProvider } from './core/fov';
export type { PathProvider } from './core/path';
export { makeRotFov, makeRotPath } from './adapters';
export type { RotFovOptions, RotPathOptions } from './adapters';
export { Allegiance, Stance } from './core/component';
export { stanceBetween } from './sim/factions';
export type { FactionId } from './sim/factions';
export {
  computeVisibility,
  isVisible,
  isExplored,
  VISIBLE_LAYER,
  EXPLORED_LAYER,
} from './sim/visibility';
export { decideAction } from './sim/ai/decide';
export { aiHunterMixin, aiWandererMixin } from './sim/ai/simple';
export { canSee, pathToward, nearestHostile } from './sim/ai/helpers';

/** Options for the public {@link createWorld}: a seed or a prebuilt RNG. */
export interface WorldOptions {
  config: Config;
  /** A numeric seed (reproducible) or a prebuilt RNG. Defaults to seed 0. */
  rng?: RNG | number;
  /** FOV provider; defaults to the rotJS shadowcasting adapter. */
  fov?: FovProvider;
  /** Pathfinding provider; defaults to the rotJS Dijkstra adapter. */
  path?: PathProvider;
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
    fov: opts.fov ?? makeRotFov(),
    path: opts.path ?? makeRotPath(),
    makeFields: createFieldManager,
    ...(opts.registries ? { registries: opts.registries } : {}),
  };
  const world = assembleWorld(core);
  // Register the built-ins at the composition edge (core may not import sim).
  // Content can override/extend any of them afterward by id.
  registerCoreHandlers(world.services.registries.handlers as Registry<ActionHandler>);
  registerCoreComponents(world.services.registries.components as ComponentRegistry);
  registerCoreTiles(world.services.tiles, world.services.config.tiles);
  registerCoreStats(world.services.registries.stats as Registry<StatDef>, world.services.config.defaultSpeed);
  registerCoreResources(world.services.registries.resources as Registry<ResourceDef>);
  registerCoreStatuses(world.services.registries.statuses as Registry<StatusDef>, world.services.config.defaultSpeed);
  (world.services.registries.generators as Registry<MapGenerator>).register('bsp', bsp);
  const mixins = world.services.registries.mixins as Registry<Mixin>;
  mixins.register('equippable', equippableMixin);
  mixins.register('aiHunter', aiHunterMixin);
  mixins.register('aiWanderer', aiWandererMixin);
  mixins.register('desire-ai', desireAiMixin);
  registerCoreConsumableEffects(world.services.registries.consumableEffects as ConsumableEffectRegistry);
  world.services.reactors.register(diedReactor);
  return world;
}
