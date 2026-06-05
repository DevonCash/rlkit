/**
 * driver — the turn loop that finally runs the engine (§6, §7.1).
 *
 * `takeTurn` processes exactly one timeline entry: an actor's turn (player via
 * the injected `actionProvider`, else AI via `decideAction`) → `perform` →
 * reschedule → per-actor `tickActor` → player FOV; or a fired delayed effect
 * resolved through the timer-effect registry. It is SYNCHRONOUS and never blocks
 * on input — it *returns* `awaiting-input` instead, which is the seam M8's async
 * input plugs into. Events arising outside an action (status ticks, timers) are
 * driven through the reaction loop via `runReactions`.
 */
import type { World, Entry } from '../core/world';
import type { EntityId } from '../core/entity';
import type { Action, ActionOutcome, TimerEffect } from '../core/action';
import { perform, runReactions } from './action';
import { decideAction } from './ai/decide';
import { tickActor } from './status';
import { computeVisibility, computeVisibilityUnion } from './visibility';

export interface TakeTurnOptions {
  player: EntityId;
  /** The player's action this turn, or `undefined` to pause for input. */
  actionProvider: () => Action | undefined;
}

export interface TurnResult {
  kind: 'acted' | 'awaiting-input' | 'idle';
  actor?: EntityId;
  outcome?: ActionOutcome;
}

/** Process one timeline entry. */
export function takeTurn(world: World, opts: TakeTurnOptions): TurnResult {
  const timeline = world.services.timeline;

  // The driver is player-centric: if the controlled player can no longer take a
  // turn (died → removed from the timeline by the death reactor), the run is
  // over. Report `idle` instead of spinning through AI-only turns forever — the
  // `step`/`run` loops only stop on a non-`acted` result.
  if (!world.state.timeline.actors.some((a) => a.id === opts.player)) {
    return { kind: 'idle' };
  }

  let entry: Entry;
  try {
    entry = timeline.next();
  } catch {
    return { kind: 'idle' }; // nothing scheduled
  }

  if (entry.kind === 'effect') {
    const fx = world.services.registries.timerEffects?.tryGet(entry.effectId) as
      | TimerEffect
      | undefined;
    if (fx) runReactions(world, fx(world, entry.payload));
    return { kind: 'acted' };
  }

  const id = entry.id;
  const isPlayer = id === opts.player;
  const baseCost = world.services.config.baseActionCost;

  const action = isPlayer ? opts.actionProvider() : decideAction(world, id);
  if (isPlayer && action === undefined) return { kind: 'awaiting-input', actor: id };

  let outcome: ActionOutcome | undefined;
  if (action) {
    outcome = perform(world, action);
    if (outcome.status === 'rejected') {
      // Player: invalid input → re-prompt without spending time.
      if (isPlayer) return { kind: 'awaiting-input', actor: id };
      // AI: a bad choice still spends a base turn, so it can't loop forever.
      timeline.reschedule(id, baseCost);
    } else {
      timeline.reschedule(id, outcome.cost);
    }
  } else {
    timeline.reschedule(id, baseCost); // AI declined → wait
  }

  // Per-actor clock: status/regen ticks, then the player's FOV.
  runReactions(world, tickActor(world, id));
  if (isPlayer) computeVisibility(world, id);

  return outcome ? { kind: 'acted', actor: id, outcome } : { kind: 'acted', actor: id };
}

/** Process turns until the player must provide input (or the timeline is idle). */
export function step(world: World, opts: TakeTurnOptions): TurnResult {
  for (;;) {
    const result = takeTurn(world, opts);
    if (result.kind !== 'acted') return result;
  }
}

export interface TickRealtimeOptions {
  player: EntityId;
  /** The player's buffered action, consumed once when the player's turn comes up. */
  action?: Action;
  /** World-ticks of time to advance this call (derive from wall time + a fixed timestep). */
  ticks: number;
}

export interface RealtimeResult {
  worldClock: number;
  /** True if the player took a turn this call (caller clears its input buffer). */
  playerActed: boolean;
  /** True if nothing remains to drive (e.g. the player left the timeline — death). */
  idle: boolean;
}

/**
 * Real-time driver (§6): advance the world by `ticks` world-ticks, processing
 * every actor/timer that becomes due in that window. Unlike `step`, it NEVER
 * blocks on input — the player's turn consumes the buffered `action`, or a
 * `wait` — so the caller can pace it from a wall clock (a fixed logical timestep
 * keeps the simulation deterministic regardless of frame rate). The turn-based
 * `takeTurn`/`step` are unchanged; this is an additive alternate driver.
 */
export function tickRealtime(world: World, opts: TickRealtimeOptions): RealtimeResult {
  const timeline = world.services.timeline;
  const target = timeline.worldClock + Math.max(0, opts.ticks);
  let buffered = opts.action;
  let playerActed = false;
  let idle = false;

  // Feeds the player a real action every turn (buffered once, else wait) so the
  // driver never returns `awaiting-input`.
  const actionProvider = (): Action => {
    const a = buffered ?? { type: 'wait', actor: opts.player };
    buffered = undefined;
    return a;
  };

  while (timeline.peekNextDue() <= target) {
    const result = takeTurn(world, { player: opts.player, actionProvider });
    if (result.kind === 'idle') {
      idle = true;
      break;
    }
    if (result.actor === opts.player) playerActed = true;
  }
  // Let the remaining time pass so energy keeps accruing when nothing was due.
  if (!idle && timeline.worldClock < target) timeline.advanceClock(target - timeline.worldClock);

  // Idle = the player can no longer act (died / removed), so there's nothing to
  // drive — true even when the timeline emptied without `takeTurn` running.
  idle = idle || !world.state.timeline.actors.some((a) => a.id === opts.player);
  return { worldClock: timeline.worldClock, playerActed, idle };
}

export interface TickRealtimeMultiOptions {
  /** The human-controlled actors; everyone else runs `decideAction` (AI). */
  players: ReadonlySet<EntityId> | readonly EntityId[];
  /** The buffered action for a player whose turn comes up (else it waits). */
  actionFor: (id: EntityId) => Action | undefined;
  ticks: number;
}

export interface RealtimeMultiResult {
  worldClock: number;
  /** Players who took a turn this call (the caller clears their input buffers). */
  acted: EntityId[];
  /** True once NO player remains scheduled — co-op game over. */
  idle: boolean;
}

/**
 * The co-op real-time driver: like {@link tickRealtime} but for a SET of
 * player-actors sharing one world. A due actor in `players` consumes its buffered
 * action (or waits); everyone else is AI. Visibility is the shared union of all
 * players' FOV (recomputed once per call). Determinism is preserved (the timeline
 * orders actors by id). Single-player drivers are untouched.
 */
export function tickRealtimeMulti(world: World, opts: TickRealtimeMultiOptions): RealtimeMultiResult {
  const timeline = world.services.timeline;
  const players = opts.players instanceof Set ? opts.players : new Set(opts.players);
  const target = timeline.worldClock + Math.max(0, opts.ticks);
  const baseCost = world.services.config.baseActionCost;
  const acted: EntityId[] = [];
  const playersScheduled = (): boolean => world.state.timeline.actors.some((a) => players.has(a.id));

  // Buffer each player's action once for this call (consumed on their first turn).
  const buffered = new Map<EntityId, Action | undefined>();
  for (const id of players) buffered.set(id, opts.actionFor(id));

  while (playersScheduled() && timeline.peekNextDue() <= target) {
    let entry: Entry;
    try {
      entry = timeline.next();
    } catch {
      break;
    }
    if (entry.kind === 'effect') {
      const fx = world.services.registries.timerEffects?.tryGet(entry.effectId) as TimerEffect | undefined;
      if (fx) runReactions(world, fx(world, entry.payload));
      continue;
    }
    const id = entry.id;
    const isPlayer = players.has(id);
    let action: Action | undefined;
    if (isPlayer) {
      action = buffered.get(id) ?? { type: 'wait', actor: id };
      buffered.set(id, undefined); // one-shot — further turns this call wait
    } else {
      action = decideAction(world, id);
    }
    if (action) {
      const outcome = perform(world, action);
      timeline.reschedule(id, outcome.status === 'rejected' ? baseCost : outcome.cost);
    } else {
      timeline.reschedule(id, baseCost);
    }
    runReactions(world, tickActor(world, id));
    if (isPlayer) acted.push(id);
  }
  if (playersScheduled() && timeline.worldClock < target) timeline.advanceClock(target - timeline.worldClock);

  // Shared fog: union of every living player's FOV into each level's `visible`.
  computeVisibilityUnion(world, [...players].filter((id) => world.state.entities.has(id)));

  return { worldClock: timeline.worldClock, acted, idle: !playersScheduled() };
}
