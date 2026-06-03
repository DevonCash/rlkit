/**
 * action — the resolve pipeline (§7.2). The engine's heart.
 *
 * `resolve(world, action)` runs the spine: look up the handler → fire pre-phase
 * reactors against a mutable context → **validate every queued effect, then
 * apply them all** (so an action never half-mutates the world) → return an
 * outcome with the events the effects produced. Effects are the ONLY writers;
 * everything upstream sees a frozen `ReadonlyWorld`.
 *
 * `resolve` does NOT drive the reaction cascade — it returns events. `perform`
 * seeds those events into the reaction loop (§7.3), which delivers them, lets
 * post-phase reactors enqueue follow-up actions, resolves those (via `resolve`,
 * the loop's injected resolver), and drains to a fixed point.
 *
 * The type declarations (`Action`, `Effect`, `ActionContext`, ...) live in
 * `core/action.ts` so the `Mixin` interface can reference them; they are
 * re-exported here, the §17-documented home of the pipeline.
 */
import { createReactionLoop } from '../core/events';
import type { GameEvent } from '../core/events';
import type {
  Action,
  ActionContext,
  ActionHandler,
  ActionOutcome,
  Effect,
} from '../core/action';
import type { World, ReadonlyWorld } from '../core/world';
import { runPreReactors, collectReactions } from './reactors';

export type {
  Action,
  CoreAction,
  Effect,
  ActionContext,
  ActionOutcome,
  ActionHandler,
  TimerEffect,
} from '../core/action';

/** A frozen, shallow read-only view — the runtime guard for "only effects mutate". */
function readonlyView(world: World): ReadonlyWorld {
  return Object.freeze({ state: world.state, services: world.services });
}

/**
 * Resolve one action to an outcome. Pure pipeline: no reaction cascade (that is
 * `perform`'s job). Never throws on an unknown action type — it rejects.
 */
/** Guard against a handler chain redirecting forever. */
const MAX_REDIRECT = 8;

export function resolve(world: World, action: Action, depth = 0): ActionOutcome {
  const view = readonlyView(world);
  const effects: Effect[] = [];
  let rejectReason: string | undefined;
  let fizzleReason: string | undefined;
  let redirectAction: Action | undefined;

  const ctx: ActionContext = {
    world: view,
    action,
    effects,
    push(effect) {
      effects.push(effect);
    },
    reject(reason) {
      if (rejectReason === undefined) rejectReason = reason;
    },
    fizzle(reason) {
      if (fizzleReason === undefined) fizzleReason = reason;
    },
    redirect(next) {
      if (redirectAction === undefined) redirectAction = next;
    },
    cost: world.services.config.baseActionCost,
  };

  // 1. Dispatch to the registered handler (catch-all → reject, never throw).
  const handler = world.services.registries.handlers?.tryGet(action.type) as
    | ActionHandler
    | undefined;
  if (!handler) {
    return { status: 'rejected', reason: `unknown action: ${action.type}` };
  }
  handler(ctx);

  // 1b. Redirect: the handler declined and named a different action to run.
  if (redirectAction !== undefined && rejectReason === undefined) {
    if (depth >= MAX_REDIRECT) {
      return { status: 'rejected', reason: 'redirect depth exceeded' };
    }
    return resolve(world, redirectAction, depth + 1);
  }

  // 2. Pre-phase reactors (skip if the handler already invalidated the action).
  if (rejectReason === undefined) runPreReactors(world, ctx);
  if (rejectReason !== undefined) {
    return { status: 'rejected', reason: rejectReason }; // no time passes, no effects
  }

  // 3. Validate ALL effects before applying ANY (atomicity).
  for (const effect of effects) {
    if (!effect.validate(view)) {
      return { status: 'rejected', reason: `effect validation failed: ${effect.kind ?? 'effect'}` };
    }
  }

  // ...then apply them all. Effects are the only place world state mutates.
  const events: GameEvent[] = [];
  for (const effect of effects) events.push(...effect.apply(world));

  if (fizzleReason !== undefined) {
    return { status: 'fizzled', cost: ctx.cost, reason: fizzleReason, events };
  }
  return { status: 'done', cost: ctx.cost, events };
}

/**
 * Drive a set of events through the reaction cascade to a fixed point (§7.3).
 * Used for events that arise OUTSIDE an action — `tickActor` (status/regen) and
 * fired timeline timer-effects — so their reactors fire too. `perform` reuses
 * the same loop for an action's events.
 */
export function runReactions(world: World, events: readonly GameEvent[]): void {
  if (events.length === 0) return;
  const loop = createReactionLoop({
    bus: world.services.bus,
    collectReactions: (event) => collectReactions(world, event),
    resolve: (a) => resolve(world, a),
    maxDepth: world.services.config.maxReactionDepth,
  });
  loop.run(events);
}

/**
 * Resolve `action` and drive the reaction cascade to a fixed point. The normal
 * entry point for performing a turn-taker's action.
 */
export function perform(world: World, action: Action): ActionOutcome {
  const outcome = resolve(world, action);
  runReactions(world, outcome.status === 'rejected' ? [] : outcome.events);
  return outcome;
}
