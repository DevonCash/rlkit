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

/** The built-in action variants resolved by the engine's own handlers. */
export type CoreAction =
  | { type: 'move'; actor: EntityId; dir: Point }
  | { type: 'wait'; actor: EntityId }
  | { type: 'bump'; actor: EntityId; dir: Point };

/**
 * An action: a built-in variant or a content-defined one. The open tail keeps
 * the union extensible; dispatch narrows the core variants with ts-pattern and
 * handles the tail with a catch-all (never throws on unknown types — §22.5).
 */
export type Action = CoreAction | { type: string; actor: EntityId; [key: string]: unknown };

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
  /** Queue an atomic mutation to be validated-then-applied. */
  push(effect: Effect): void;
  /** INVALID: no time passes, no effects apply — re-prompt the player. */
  reject(reason: string): void;
  /** FAILED: queued effects still apply and the turn is spent. */
  fizzle(reason: string): void;
  /** Energy cost of the action; pre-phase reactors may adjust it. */
  cost: number;
}

export type ActionOutcome =
  | { status: 'done'; cost: number; events: GameEvent[] }
  | { status: 'rejected'; reason: string }
  | { status: 'fizzled'; cost: number; reason: string; events: GameEvent[] };

/** An action handler: inspects the context and pushes effects or rejects/fizzles. */
export type ActionHandler = (ctx: ActionContext) => void;

/**
 * A registered, serialize-by-name effect for the timeline (§7.1). Delayed
 * effects store an `effectId` in state; when the timer fires, the engine looks
 * the function up here and applies it. (Used by the timeline; transient
 * pipeline effects above are not serialized.)
 */
export type TimerEffect = (world: World, payload?: unknown) => GameEvent[];
