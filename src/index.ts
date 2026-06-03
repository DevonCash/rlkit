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
import { registerCoreTimerEffects } from './sim/effects';
import type { TimerEffectRegistry } from './sim/effects';
import { takeTurn } from './sim/driver';
import { buildFrame } from './render/frame';
import type { Renderer } from './render/renderer';
import type { Camera, Viewport } from './render/camera';
import { bsp } from './mapgen/bsp';
import type { MapGenerator } from './mapgen/generator';
import type { ComponentRegistry } from './core/component';
import type { Action, ActionHandler } from './core/action';
import type { EntityId } from './core/entity';
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
  attackHandler,
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

// --- field system + DesireAI + autoexplore (§11.3) -------------------------
export type {
  FieldId,
  FieldKind,
  FieldDescriptor,
  FieldProducer,
  FieldCtx,
  FieldStore,
  FieldManager,
  Desire,
  DesireProfile,
} from './core/fields';
export { DesireAIData } from './core/component';
export { createFieldManager, registerFieldProducer, FIELD_LAYER_PREFIX } from './sim/ai/field';
export type { GoalSource } from './sim/ai/field';
export { goalProducer, scentProducer, influenceProducer } from './sim/ai/producers';
export type { GoalParams, ScentParams, InfluenceParams } from './sim/ai/producers';
export { desireAiMixin } from './sim/ai/desire-ai';
export { autoexploreStep } from './sim/ai/autoexplore';

// --- presentation: render frame + renderers + driver (§13, §6) -------------
export { buildFrame } from './render/frame';
export type { RenderFrame, FrameCell, Overlay } from './render/frame';
export type { Camera, Viewport } from './render/camera';
export type { Renderer } from './render/renderer';
export { AsciiRenderer } from './render/ascii-renderer';
export { CanvasRenderer } from './render/canvas-renderer';
export type { Ctx2D, CanvasRendererOptions } from './render/canvas-renderer';
export { takeTurn, step } from './sim/driver';
export type { TakeTurnOptions, TurnResult } from './sim/driver';
export { registerCoreTimerEffects } from './sim/effects';
export type { TimerEffectRegistry } from './sim/effects';
export { runReactions } from './sim/action';
export { createMessageLog } from './ui/log';
export type { MessageLog } from './ui/log';

// --- input + UI stack (§14, §15) -------------------------------------------
export type { Command, InputSource, Keymap } from './input/command';
export { mapKey } from './input/keymap';
export { KeyboardInput, keyComboOf } from './input/input';
export type { KeyLikeEvent, EventTargetLike } from './input/input';
export { PointerInput } from './input/pointer';
export type { PointerInputOptions } from './input/pointer';
export { commandToAction, isUIIntent, moveDirection } from './input/command-to-action';
export type { UIIntent, CommandContext } from './input/command-to-action';
export { createUIStack } from './ui/stack';
export type { Modal, ModalResult, UIStack } from './ui/stack';
export { createListModal } from './ui/modals/list-modal';
export type { ListModal, ListItem } from './ui/modals/list-modal';
export { createTargetingModal } from './ui/modals/targeting-modal';
export type { TargetingModal } from './ui/modals/targeting-modal';
export { createHud } from './ui/hud';
export type { Hud } from './ui/hud';
export { createLogView } from './ui/log-view';
export type { LogView } from './ui/log-view';
export { createSession } from './ui/session';
export type { Session, SessionOptions } from './ui/session';

/** Drive the engine: process turns, rendering after each player turn. */
export interface RunOptions {
  player: EntityId;
  actionProvider: () => Action | undefined;
  renderer?: Renderer;
  viewport?: Viewport;
  camera?: Camera;
}

/**
 * The interactive driver (§18). Loops `takeTurn`, rendering after each player
 * turn; stops on `idle` or when the action provider yields `undefined`
 * (awaiting input — M8's async input source resumes here instead of stopping).
 */
export function run(world: World, opts: RunOptions): void {
  const viewport: Viewport = opts.viewport ?? { width: 80, height: 24 };
  const camera: Camera = opts.camera ?? { centerOn: opts.player };
  for (;;) {
    const result = takeTurn(world, { player: opts.player, actionProvider: opts.actionProvider });
    if (result.kind !== 'acted') break;
    if (opts.renderer && result.actor === opts.player) {
      opts.renderer.draw(buildFrame(world, viewport, camera));
    }
  }
}

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
  registerCoreTimerEffects(world.services.registries.timerEffects as TimerEffectRegistry);
  world.services.reactors.register(diedReactor);
  return world;
}
