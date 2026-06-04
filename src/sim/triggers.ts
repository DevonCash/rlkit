/**
 * triggers — place-scoped reactor dispatch + zone/trigger authoring (§11A.5).
 *
 * Triggers are the `cell`/`zone`/`tile` dispatch path the reactor model (§7.3)
 * reserved. On a place-transition event (`entity:entered`/`exited`, which carry
 * `cell` + `levelId`), `collectTriggerReactions` matches:
 *   - tile rules   keyed by the tile-type id at the cell (stateless content);
 *   - cell instances at that exact cell;
 *   - zone instances whose zone contains the cell;
 * gates each by its `testId`, runs the `effectId`, and (for `once` instances)
 * flips `fired`. Like the timeline, the trigger system is the sole writer of its
 * own substate (`state.triggers`) — domain mutation (hp) still flows through
 * effects, because trigger-effects return `damage` ACTIONS (or schedule timers).
 */
import { cellOf, type Cell } from '../core/coords';
import { tileIndexAt } from '../core/level';
import type { Action } from '../core/action';
import type { GameEvent } from '../core/events';
import type { Registry } from '../core/registry';
import type { World, ReadonlyWorld } from '../core/world';
import type { TriggerInstance, TileTrigger, Zone } from '../core/trigger';
import type { Region } from '../mapgen/generator';
import type { TimerEffectRegistry } from './effects';
import { resolve } from './action';

/** A trigger-effect: side-effects via services (e.g. schedule) and/or returns actions. */
export type TriggerEffect = (
  world: World,
  event: GameEvent,
  data?: Record<string, unknown>,
) => Action[] | void;

/** A trigger predicate: a pure gate over the event. */
export type TriggerTest = (world: ReadonlyWorld, event: GameEvent) => boolean;

export type TriggerEffectRegistry = Registry<TriggerEffect>;
export type TriggerTestRegistry = Registry<TriggerTest>;
export type TileTriggerRegistry = Registry<readonly TileTrigger[]>;

function effectsReg(world: World): TriggerEffectRegistry | undefined {
  return world.services.registries.triggerEffects as TriggerEffectRegistry | undefined;
}
function testsReg(world: World): TriggerTestRegistry | undefined {
  return world.services.registries.triggerTests as TriggerTestRegistry | undefined;
}
function tileReg(world: World): TileTriggerRegistry | undefined {
  return world.services.registries.tileTriggers as TileTriggerRegistry | undefined;
}

/** A named test passes (fail-closed if the id is unregistered). */
function passesTest(world: World, event: GameEvent, testId: string | undefined): boolean {
  if (testId === undefined) return true;
  const test = testsReg(world)?.tryGet(testId);
  return test ? test(world, event) : false;
}

/**
 * Gather follow-up actions from the place-scoped triggers an event hits (§11A.5).
 * Called by `collectReactions` for every drained event; no-ops unless the event
 * carries a `cell` + `levelId`.
 */
export function collectTriggerReactions(world: World, event: GameEvent): Action[] {
  const cell = (event as { cell?: unknown }).cell;
  const levelId = (event as { levelId?: unknown }).levelId;
  if (typeof cell !== 'number' || typeof levelId !== 'string') return [];

  const effects = effectsReg(world);
  if (!effects) return [];
  const out: Action[] = [];

  // 1. Tile-type rules (stateless content).
  const tiles = tileReg(world);
  const level = world.state.levels.get(levelId);
  if (tiles && level) {
    const tileId = world.services.tiles.byIndex(tileIndexAt(level, cell)).id;
    for (const rule of tiles.tryGet(tileId) ?? []) {
      if (rule.on !== event.type) continue;
      if (!passesTest(world, event, rule.testId)) continue;
      const fx = effects.tryGet(rule.effectId);
      if (!fx) continue;
      const actions = fx(world, event, rule.data);
      if (actions) out.push(...actions);
    }
  }

  // 2. Placed cell/zone instances (stateful: `once`/`fired`).
  const ts = world.state.triggers;
  for (const inst of ts.triggers) {
    if (inst.fired) continue;
    if (inst.on !== event.type || inst.levelId !== levelId) continue;
    if (!scopeMatches(ts.zones, inst, cell, levelId)) continue;
    if (!passesTest(world, event, inst.testId)) continue;
    const fx = effects.tryGet(inst.effectId);
    if (!fx) continue;
    const actions = fx(world, event, inst.data);
    if (actions) out.push(...actions);
    if (inst.once) inst.fired = true; // trigger service writes its own substate
  }
  return out;
}

function scopeMatches(zones: readonly Zone[], inst: TriggerInstance, cell: Cell, levelId: string): boolean {
  if (inst.scope === 'cell') return inst.cell === cell;
  const zone = zones.find((z) => z.id === inst.zoneId && z.levelId === levelId);
  return !!zone && zone.cells.includes(cell);
}

// --- authoring API ----------------------------------------------------------

/** Add a zone (named cell-set) to the world. */
export function addZone(world: World, zone: Zone): void {
  world.state.triggers.zones.push(zone);
}

/** Add a placed cell/zone trigger instance to the world. */
export function addTrigger(world: World, instance: TriggerInstance): void {
  world.state.triggers.triggers.push(instance);
}

/** Attach a stateless rule to a tile TYPE (every tile of that id). */
export function addTileTrigger(world: World, tileTypeId: string, rule: TileTrigger): void {
  const reg = tileReg(world);
  if (!reg) return;
  const cur = reg.tryGet(tileTypeId) ?? [];
  const next = [...cur, rule];
  if (reg.has(tileTypeId)) reg.override(tileTypeId, next);
  else reg.register(tileTypeId, next);
}

/** Promote a rectangular mapgen `Region` into a {@link Zone} of packed cells. */
export function regionToZone(
  region: Region,
  levelId: string,
  width: number,
  id: string,
  data?: Record<string, unknown>,
): Zone {
  const cells: Cell[] = [];
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      cells.push(cellOf({ x, y }, width));
    }
  }
  return { id, levelId, cells, ...(data ? { data } : {}) };
}

// --- core content (proof) ---------------------------------------------------

/** A target's hp is read for `cause` blame; helper for scripted-damage effects. */
function damageOccupant(target: string, amount: number, cause: string): Action {
  return { type: 'damage', actor: target, target, amount, cause };
}

/**
 * Register the batteries-included trigger tests/effects (§11A.5 proof content):
 * a `trap` (cell → delayed detonation), a room `ambush` (zone → immediate hit),
 * and a `hazard` (tile → immediate hit). All damage flows through the `damage`
 * action → the effect pipeline.
 */
export function registerCoreTriggerContent(
  tests: TriggerTestRegistry,
  effects: TriggerEffectRegistry,
  timerEffects: TimerEffectRegistry,
): void {
  // Only living things (with an hp pool) trip traps/hazards.
  tests.register('isLiving', (world, event) => {
    const id = (event as { entity?: string }).entity;
    const e = id ? world.state.entities.get(id) : undefined;
    return !!e && e.components.has('resources');
  });

  // trap: on entry, arm a delayed detonation at the cell.
  effects.register('trap:arm', (world, event, data) => {
    const cell = (event as { cell: number }).cell;
    const levelId = (event as { levelId: string }).levelId;
    const delay = (data?.delay as number | undefined) ?? world.services.config.baseActionCost;
    const amount = (data?.amount as number | undefined) ?? 5;
    world.services.timeline.schedule(delay, 'trap:detonate', { cell, levelId, amount });
  });

  // ambush: on zone entry, the room strikes the intruder immediately.
  effects.register('ambush:strike', (_world, event, data) => {
    const target = (event as { entity: string }).entity;
    return [damageOccupant(target, (data?.amount as number | undefined) ?? 3, 'ambush')];
  });

  // hazard: stepping on the tile burns immediately.
  effects.register('hazard:burn', (_world, event, data) => {
    const target = (event as { entity: string }).entity;
    return [damageOccupant(target, (data?.amount as number | undefined) ?? 2, 'burn')];
  });

  // detonate: resolve a `damage` action against every occupant of the cell.
  timerEffects.register('trap:detonate', (world, payload) => {
    const { cell, levelId, amount } = payload as { cell: number; levelId: string; amount: number };
    const events: GameEvent[] = [];
    for (const id of world.services.queries.at(cell, levelId)) {
      const out = resolve(world, damageOccupant(id, amount, 'trap'));
      if (out.status !== 'rejected') events.push(...out.events);
    }
    return events;
  });
}
