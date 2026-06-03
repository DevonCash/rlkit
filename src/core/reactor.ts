/**
 * reactor — the one reaction mechanism (§7.3).
 *
 * Entity reactions (mixin `onAction`/`onEvent`), place reactions (triggers),
 * and global/system reactions are the same thing: a reaction registered for an
 * event/action, differing only in *scope* and *phase*.
 *
 *   phase 'pre'  — fires BEFORE effects apply; receives a mutable
 *                  `ActionContext` and may reject/fizzle/edit pending effects.
 *                  Keyed by ACTION type. This is `Mixin.onAction`.
 *   phase 'post' — fires AFTER, receives a read-only event fact and may only
 *                  enqueue new actions. Keyed by EVENT type. This is
 *                  `Mixin.onEvent`.
 *
 * Entity-scope reactors come from an entity's mixins (resolved by name via the
 * mixin registry); `global` reactors register here. `cell`/`zone` scopes are
 * part of the model but have no dispatch path until triggers/zones land in
 * milestone 11 (documented no-op).
 */
import type { Action, ActionContext } from './action';
import type { GameEvent } from './events';
import type { ReadonlyWorld } from './world';

export type ReactorScope = 'entity' | 'cell' | 'zone' | 'global';
export type ReactorPhase = 'pre' | 'post';

/** Context handed to a post-phase reactor: a read-only event fact. */
export interface EventReactionCtx {
  readonly event: GameEvent;
  readonly world: ReadonlyWorld;
}

/** Pre reactors mutate an `ActionContext`; post reactors read an event fact. */
export type ReactionCtx = ActionContext | EventReactionCtx;

export interface Reactor {
  /** Action type (pre) or event type (post) this reacts to. */
  on: string;
  scope: ReactorScope;
  phase: ReactorPhase;
  /** Pre: `ctx` is a mutable `ActionContext`. Post: a read-only event fact. */
  react(ctx: ReactionCtx): Action[] | void;
}

/**
 * Registry of `global`-scope reactors, keyed by `(phase, on)`. Entity-scope
 * reactors are NOT stored here — they are resolved from `entity.mixins` at
 * dispatch time. Iteration is insertion-stable for determinism.
 */
export interface ReactorRegistry {
  register(reactor: Reactor): void;
  /** Global pre reactors for an action type, in registration order. */
  pre(actionType: string): Reactor[];
  /** Global post reactors for an event type, in registration order. */
  post(eventType: string): Reactor[];
}

export function createReactorRegistry(): ReactorRegistry {
  const preByType = new Map<string, Reactor[]>();
  const postByType = new Map<string, Reactor[]>();
  const bucket = (m: Map<string, Reactor[]>, key: string): Reactor[] => {
    let arr = m.get(key);
    if (!arr) {
      arr = [];
      m.set(key, arr);
    }
    return arr;
  };
  return {
    register(reactor) {
      // cell/zone scopes are accepted but never dispatched until M11.
      const target = reactor.phase === 'pre' ? preByType : postByType;
      bucket(target, reactor.on).push(reactor);
    },
    pre(actionType) {
      return preByType.get(actionType) ?? [];
    },
    post(eventType) {
      return postByType.get(eventType) ?? [];
    },
  };
}
