/**
 * action — the action/effect spine types (§7.2).
 *
 * These are the type declarations the whole reaction model is built on. They
 * live in `core` (not `sim`) because the `Mixin` interface (`core/mixin.ts`)
 * and `Reactor` (`core/reactor.ts`) reference `ActionContext`/`Action`, and
 * `core` may not import `sim`. The *logic* — `resolve()` and the action
 * handlers — lives in `sim/action.ts`. (§17 records this core/sim split.)
 *
 * `Action`/`GameEvent` are runtime-only (never serialized), so they stay plain
 * interfaces, not Zod schemas (§16.4). Content extends the unions through the
 * declaration-merged `ActionMap` seam below; engine match sites stay exhaustive
 * over the core variants and fall through to a catch-all for content types.
 */
import type { Point } from './coords';
import type { EntityId } from './entity';
import type { GameEvent } from './events';
import type { World, ReadonlyWorld } from './world';
import type { Registry } from './registry';

/** The built-in action variants resolved by the engine's own handlers. */
export type CoreAction =
  | { type: 'move'; actor: EntityId; dir: Point }
  | { type: 'wait'; actor: EntityId };

/**
 * Declaration-merge seam (§7.2): an external consumer of `rlkit` augments this
 * interface to add strongly-typed action variants without patching engine files:
 *
 *   declare module 'rlkit' {
 *     interface ActionMap { useOn: { type: 'useOn'; actor: EntityId; ... } }
 *   }
 *
 * Empty by default, so `ActionMap[keyof ActionMap]` is `never` — a no-op in the
 * union until something is merged in.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ActionMap {}

/**
 * An action: a built-in variant, a declaration-merged one (`ActionMap`), or an
 * untyped content one (the open tail). Dispatch narrows the core variants with
 * ts-pattern and handles the tail with a catch-all (never throws — §22.5).
 */
export type Action =
  | CoreAction
  | ActionMap[keyof ActionMap]
  | { type: string; actor: EntityId; [key: string]: unknown };

/**
 * An atomic state mutation. `validate` is a pure pre-flight check; every queued
 * effect is validated before ANY is applied (validate-all-then-apply, §7.2).
 * `apply` is the ONLY place world state is mutated and returns the events that
 * describe what happened.
 */
export interface Effect {
  /** Optional label for diagnostics / deterministic ordering aids. */
  readonly kind?: string;
  validate(world: ReadonlyWorld): boolean;
  apply(world: World): GameEvent[];
}

/**
 * The mutable context a handler (and pre-phase reactors) operate on. Upstream
 * sees only a `ReadonlyWorld`; mutation happens exclusively inside `Effect.apply`.
 */
export interface ActionContext {
  readonly world: ReadonlyWorld;
  readonly action: Action;
  /**
   * The effects queued so far, in push order. Exposed so pre-phase reactors can
   * inspect and edit pending effects (e.g. an armor reactor reducing a pending
   * damage effect — §7.2 step 2). Mutating effect internals here is allowed;
   * the array is the live queue.
   */
  readonly effects: Effect[];
  /** Queue an atomic mutation to be validated-then-applied. */
  push(effect: Effect): void;
  /** INVALID: no time passes, no effects apply — re-prompt the player. */
  reject(reason: string): void;
  /** FAILED: queued effects still apply and the turn is spent. */
  fizzle(reason: string): void;
  /**
   * Re-dispatch this turn as a different action: the handler declines to act and
   * `resolve` instead resolves `action` fully (its own handler + pre-phase
   * reactors + validate-all-then-apply). Used by `move` to become an `attack`
   * (a bump) so the target's reactors fire. Effects pushed before redirecting
   * are discarded. Optional `announce` events are prepended to the redirected
   * outcome's events (e.g. a `bumped` event ahead of the attack's `damaged`),
   * unless the redirected action rejects.
   */
  redirect(action: Action, announce?: GameEvent[]): void;
  /** Energy cost of the action; pre-phase reactors may adjust it. */
  cost: number;
}

export type ActionOutcome =
  | { status: 'done'; cost: number; events: GameEvent[] }
  | { status: 'rejected'; reason: string }
  | { status: 'fizzled'; cost: number; reason: string; events: GameEvent[] };

/** An action handler: inspects the context and pushes effects or rejects/fizzles. */
export type ActionHandler = (ctx: ActionContext) => void;

export type ActionHandlerRegistry = Registry<ActionHandler>;

/** Typed view of the action-handler registry (centralizes the one downcast). */
export function handlerRegistryOf(world: ReadonlyWorld): ActionHandlerRegistry {
  return world.services.registries.handlers as ActionHandlerRegistry;
}

/**
 * A registered, serialize-by-name effect for the timeline (§7.1). Delayed
 * effects store an `effectId` in state; when the timer fires, the engine looks
 * the function up here and applies it. (Used by the timeline; transient
 * pipeline effects above are not serialized.)
 */
export type TimerEffect = (world: World, payload?: unknown) => GameEvent[];
