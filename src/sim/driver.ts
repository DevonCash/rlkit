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
import { computeVisibility } from './visibility';

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
