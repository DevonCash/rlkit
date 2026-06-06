/**
 * rlkit — public API surface (§18).
 *
 * The headless core is built milestone-by-milestone (§20) behind this entry
 * point. This module is the composition edge: it may wire concrete adapters
 * (e.g. the pure-rand RNG) that the core itself must not import.
 */
import { createWorld as assembleWorld } from './core/world';
import type { World, WorldState, CreateWorldOptions } from './core/world';
import { makeRng } from './adapters/rng';
import { encodeState, decodeState } from './adapters/storage';
import {
  parseSave,
  migrate,
  CURRENT_SCHEMA_VERSION,
  type SaveBlob,
  type MigrationTable,
} from './content/validate';
import { cellOf } from './core/coords';
import { composeModules, assertModulesPresent, type Module } from './core/module';
import { get } from './core/entity';
import type { Position } from './core/component';
import { defaultConfig } from './config/defaults';
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
import { createFieldManager } from './sim/field';
import { createFlagManager } from './sim/flags';
import { attackBumpInteraction } from './sim/bump';
import { desireAiMixin } from './sim/ai/desire-ai';
import { diedReactor } from './sim/death';
import { registerCoreTimerEffects } from './sim/effects';
import type { TimerEffectRegistry } from './sim/effects';
import { registerCoreTriggerContent } from './sim/triggers';
import type { TriggerEffectRegistry, TriggerTestRegistry } from './sim/triggers';
import { takeTurn } from './sim/driver';
import { descendHandler, ascendHandler } from './sim/transition';
import { buildFrame } from './render/frame';
import type { Renderer } from './render/renderer';
import type { Camera, Viewport } from './render/camera';
import { bsp } from './mapgen/bsp';
import { cellular } from './mapgen/cellular';
import { drunkard } from './mapgen/drunkard';
import { prefab } from './mapgen/prefab';
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

// --- modules (§6.4) --------------------------------------------------------
export type { Module } from './core/module';
export { orderModules, composeModules, assertModulesPresent } from './core/module';
export { combatModule, lastAttackerOf } from './modules/combat';
export type { CombatOptions } from './modules/combat';
export { progressionModule, Experience } from './modules/progression';
export type { ProgressionOptions } from './modules/progression';
export { identificationModule, displayName, Identity } from './modules/identification';
export { rangedModule, aiRangedMixin } from './modules/ranged';
export type { RangedOptions } from './modules/ranged';
export { hungerModule } from './modules/hunger';
export type { HungerOptions } from './modules/hunger';
export { doorsModule } from './modules/doors';
export {
  createComponentRegistry,
  registerCoreComponents,
  parseComponent,
  Position,
  Renderable,
  Info,
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
  EventMap,
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
  ensureFloatLayer,
  ensureU8Layer,
  ensureU16Layer,
  TILES_LAYER,
} from './core/level';
export type { TilePalette } from './core/tiles';
export { createTilePalette, registerCoreTiles } from './core/tiles';
export { setTileEffect } from './core/tile-effect';

// --- tile flags + composed-flag index + steppers (§8.1, R1) ----------------
export { createFlagRegistry, MAX_FLAGS } from './core/flags';
export type { FlagRegistry, FlagManager, FlagIndex } from './core/flags';
export { createFlagManager, FLAGS_LAYER } from './sim/flags';
export { TileFlags } from './core/component';
export { registerStepper } from './sim/stepper';
export type { Stepper } from './sim/stepper';

// --- cell-network connectivity (§6, R3) ------------------------------------
export { createNetworkManager } from './sim/network';
export type { NetworkManager, NetworkIndex, NetworkDescriptor } from './sim/network';

// --- grid connectivity kernels (§8.1) --------------------------------------
export { reachable, labelComponents } from './core/graph';

// --- geometry / targeting (§11A.3) -----------------------------------------
export { line, hasLoS, cellsIn } from './core/geometry';
export type { Shape, CellsInOptions } from './core/geometry';

// --- action / effect / reactor / mixin spine (§7.2, §7.3, §5.3) ------------
export type {
  Action,
  ActionMap,
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
export { createBumpInteractionRegistry, BLOCK } from './core/bump';
export type { BumpInteraction, BumpInteractionRegistry, BumpContext, BumpResult } from './core/bump';
export { attackBumpInteraction } from './sim/bump';
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
  damageHandler,
  makeMoveEffect,
} from './sim/handlers';
export { runPreReactors, collectReactions } from './sim/reactors';

// --- triggers + zones (§11A.5) ---------------------------------------------
export type { Zone, TriggerInstance, TriggerScope, TileTrigger, TriggerState } from './core/trigger';
export { emptyTriggerState } from './core/trigger';
export {
  addZone,
  addTrigger,
  addTileTrigger,
  regionToZone,
  collectTriggerReactions,
  registerCoreTriggerContent,
} from './sim/triggers';
export type {
  TriggerEffect,
  TriggerTest,
  TriggerEffectRegistry,
  TriggerTestRegistry,
  TileTriggerRegistry,
} from './sim/triggers';

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
export { cellular, generateCellular } from './mapgen/cellular';
export { drunkard, generateDrunkard } from './mapgen/drunkard';
export { prefab, generatePrefab, parsePrefab, stampPrefab, DEFAULT_PREFABS } from './mapgen/prefab';
export type { Prefab } from './mapgen/prefab';
export { decorate, entranceOf } from './mapgen/decorate';
export { reachableFrom, walkableCells } from './mapgen/reachability';
export { buildLevel } from './mapgen/build-level';
export type { BuildLevelParams, BuiltLevel } from './mapgen/build-level';
export { spawn } from './sim/spawn';
export type { SpawnOptions } from './sim/spawn';

// --- level transitions: descend / ascend (§8.2) ----------------------------
export { Stairs } from './core/component';
export { transitionEffect, descendHandler, ascendHandler } from './sim/transition';
export type { LevelLink, LevelRequest, LevelProvider } from './core/world';

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
  computeVisibilityUnion,
  computeVisibilityFor,
  visibleLayerFor,
  exploredLayerFor,
  isVisible,
  isExplored,
  canViewerSee,
  VISIBLE_LAYER,
  EXPLORED_LAYER,
} from './sim/visibility';
export { describeCell } from './sim/look';
export type { CellDescription, CellEntityInfo } from './sim/look';
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
export { createFieldManager, registerFieldProducer, FIELD_LAYER_PREFIX } from './sim/field';
export type { GoalSource } from './sim/field';
export { goalProducer, scentProducer, influenceProducer } from './sim/ai/producers';
export type { GoalParams, ScentParams, InfluenceParams } from './sim/ai/producers';
export { desireAiMixin } from './sim/ai/desire-ai';
export { autoexploreStep } from './sim/ai/autoexplore';

// --- presentation: render frame + renderers + driver (§13, §6) -------------
export { buildFrame } from './render/frame';
export type { RenderFrame, FrameCell, Overlay, BuildFrameOptions } from './render/frame';
export type { Camera, Viewport } from './render/camera';
export { viewportOrigin, cameraLevel } from './render/camera';
export type { Renderer } from './render/renderer';
export { AsciiRenderer } from './render/ascii-renderer';
export { CanvasRenderer } from './render/canvas-renderer';
export type { Ctx2D, CanvasRendererOptions } from './render/canvas-renderer';
export { createGameServer } from './multiplayer/server';
export type { GameServer, GameServerOptions, ServerUpdate, PlayerView } from './multiplayer/server';
export { takeTurn, step, tickRealtime, tickRealtimeMulti } from './sim/driver';
export type {
  TakeTurnOptions,
  TurnResult,
  TickRealtimeOptions,
  RealtimeResult,
  TickRealtimeMultiOptions,
  RealtimeMultiResult,
} from './sim/driver';
export { registerCoreTimerEffects } from './sim/effects';
export type { TimerEffectRegistry } from './sim/effects';
export { runReactions } from './sim/action';
export { createMessageLog } from './ui/log';
export type { MessageLog, MessageLogOptions, FieldResolver } from './ui/log';

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
export type { CommandCtx, CommandHandler, CommandTable } from './ui/commands';

// --- save / load (§16) -----------------------------------------------------
export { CURRENT_SCHEMA_VERSION, parseSave, parseBlueprint, migrate } from './content/validate';
export type { SaveBlob, Migration, MigrationTable } from './content/validate';
export {
  encodeState,
  decodeState,
  createMemoryStorage,
  createStorage,
  type StorageLike,
  type Storage,
} from './adapters/storage';

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
  /** Opt-in feature modules, composed (in dependency order) after core content. */
  modules?: Module[];
}

/**
 * Create a world, defaulting the RNG to the pure-rand-backed implementation.
 * Pass a numeric `rng` seed for reproducible runs, or your own `RNG`.
 */
/**
 * Register the batteries-included content at the composition edge (core may not
 * import sim). Run for both a fresh {@link createWorld} and a reconstructed
 * {@link loadWorld}, so a loaded world resolves the same handler/mixin/effect
 * names its save referenced. Content can override/extend any entry by id after.
 */
function registerCoreContent(world: World): void {
  const handlers = world.services.registries.handlers as Registry<ActionHandler>;
  registerCoreHandlers(handlers);
  handlers.register('descend', descendHandler);
  handlers.register('ascend', ascendHandler);
  registerCoreComponents(world.services.registries.components as ComponentRegistry);
  registerCoreTiles(world.services.tiles, world.services.config.tiles);
  registerCoreStats(world.services.registries.stats as Registry<StatDef>, world.services.config.defaultSpeed);
  registerCoreResources(world.services.registries.resources as Registry<ResourceDef>);
  registerCoreStatuses(world.services.registries.statuses as Registry<StatusDef>, world.services.config.defaultSpeed);
  (world.services.registries.generators as Registry<MapGenerator>).register('bsp', bsp);
  (world.services.registries.generators as Registry<MapGenerator>).register('cellular', cellular);
  (world.services.registries.generators as Registry<MapGenerator>).register('drunkard', drunkard);
  (world.services.registries.generators as Registry<MapGenerator>).register('prefab', prefab);
  const mixins = world.services.registries.mixins as Registry<Mixin>;
  mixins.register('equippable', equippableMixin);
  mixins.register('aiHunter', aiHunterMixin);
  mixins.register('aiWanderer', aiWandererMixin);
  mixins.register('desire-ai', desireAiMixin);
  registerCoreConsumableEffects(world.services.registries.consumableEffects as ConsumableEffectRegistry);
  registerCoreTimerEffects(world.services.registries.timerEffects as TimerEffectRegistry);
  // R7 default: bump → attack (the roguelike convention). Config-toggleable —
  // `bumpToAttack: false` gives intent-based combat (bump = swap/block).
  if (world.services.config.movement.bumpToAttack) {
    world.services.bumpInteractions.register(attackBumpInteraction);
  }

  registerCoreTriggerContent(
    world.services.registries.triggerTests as TriggerTestRegistry,
    world.services.registries.triggerEffects as TriggerEffectRegistry,
    world.services.registries.timerEffects as TimerEffectRegistry,
  );
  world.services.reactors.register(diedReactor);
}

export function createWorld(opts: WorldOptions): World {
  const rng: RNG = typeof opts.rng === 'object' ? opts.rng : makeRng(opts.rng ?? 0);
  const core: CreateWorldOptions = {
    config: opts.config,
    rng,
    makeTimeline: createTimeline,
    fov: opts.fov ?? makeRotFov(),
    path: opts.path ?? makeRotPath(),
    makeFields: createFieldManager,
    makeFlagIndex: createFlagManager,
    ...(opts.registries ? { registries: opts.registries } : {}),
  };
  const world = assembleWorld(core);
  registerCoreContent(world);
  composeModules(world, opts.modules ?? []); // after core, so a module may override a built-in
  return world;
}

// --- save / load (§16) -----------------------------------------------------

/**
 * Snapshot a world to a {@link SaveBlob}. Refreshes the canonical `state.rng`
 * from the live generator first — it is only seeded at construction and goes
 * stale as the world draws — so the blob captures the current RNG position.
 */
export function saveWorld(world: World): SaveBlob {
  world.state.rng = world.services.rng.getState();
  return { schemaVersion: CURRENT_SCHEMA_VERSION, world: world.state };
}

/**
 * Encode a world to a portable save string: the `schemaVersion`, a newline,
 * then the devalue-encoded snapshot (same wire format as {@link createStorage}).
 */
export function encodeSave(world: World): string {
  const blob = saveWorld(world);
  return `${blob.schemaVersion}\n${encodeState(blob.world)}`;
}

/** Options for {@link loadWorld}. Services/config are reconstructed, not stored. */
export interface LoadOptions {
  /** Engine config to rebuild services against (defaults to {@link defaultConfig}). */
  config?: Config;
  /** Version→version upgrades applied before validation (defaults to none). */
  migrations?: MigrationTable;
  fov?: FovProvider;
  path?: PathProvider;
  registries?: Registries;
  /**
   * Opt-in modules to re-apply on load. Must include every module the save was
   * written with (its manifest, `state.modules`) — a missing one throws.
   */
  modules?: Module[];
}

/**
 * Reconstruct a world from a save string or a decoded blob (§16): decode →
 * migrate → validate → rebuild services over the restored state → reseed the
 * RNG → rebuild the spatial/component index from the restored entities.
 */
export function loadWorld(raw: string | unknown, opts: LoadOptions = {}): World {
  let decoded: unknown;
  if (typeof raw === 'string') {
    const nl = raw.indexOf('\n');
    decoded = { schemaVersion: Number(raw.slice(0, nl)), world: decodeState(raw.slice(nl + 1)) };
  } else {
    decoded = raw;
  }
  const blob = parseSave(migrate(decoded, opts.migrations ?? {}));
  const state = blob.world as WorldState;

  const core: CreateWorldOptions = {
    config: opts.config ?? defaultConfig,
    rng: makeRng(0), // seed irrelevant — state is restored below
    makeTimeline: createTimeline,
    fov: opts.fov ?? makeRotFov(),
    path: opts.path ?? makeRotPath(),
    makeFields: createFieldManager,
    makeFlagIndex: createFlagManager,
    initialState: state,
    ...(opts.registries ? { registries: opts.registries } : {}),
  };
  const world = assembleWorld(core);
  registerCoreContent(world);

  // Re-apply the opt-in modules the save was written with (validated against the
  // manifest) so their components/handlers/effects resolve over the restored state.
  assertModulesPresent(state.modules ?? [], opts.modules ?? []);
  composeModules(world, opts.modules ?? []);

  // Resume the RNG at the saved position so draws continue identically.
  world.services.rng.setState(state.rng);

  // Rebuild the live query index from the restored entities (it is not part of
  // the save — only `WorldState` is). Mirrors spawn: index every entity, then
  // place the positioned ones in the spatial index.
  const { queries } = world.services;
  for (const e of state.entities.values()) queries.index(e);
  for (const e of state.entities.values()) {
    const pos = get<Position>(e, 'position');
    if (!pos) continue; // unplaced (e.g. items held in an inventory)
    const level = state.levels.get(pos.levelId);
    if (!level) throw new Error(`loadWorld: entity ${e.id} references missing level ${pos.levelId}`);
    queries.place(e.id, pos.levelId, cellOf({ x: pos.x, y: pos.y }, level.width));
  }

  return world;
}
