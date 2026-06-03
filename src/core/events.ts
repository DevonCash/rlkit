/**
 * events — the typed event union and the event bus (§7.2, §12).
 *
 * `GameEvent` is a discriminated union on `type`; dispatch sites use ts-pattern
 * and stay exhaustive over core variants, falling through to a catch-all for
 * content-defined events. Events are runtime-only — never serialized — so they
 * stay plain interfaces, not Zod schemas (§16.4).
 *
 * The bus itself is a dumb synchronous pub/sub with deterministic
 * (registration-order) delivery. The FIFO reaction loop (§7.3) is a separate
 * primitive (`createReactionLoop`) layered over it so the bus surface stays
 * minimal and the loop is independently testable.
 */
import type { Cell } from './coords';
import type { EntityId } from './entity';
import type { Action, ActionOutcome } from './action';

export type GameEvent =
  | { type: 'moved'; entity: EntityId; from: Cell; to: Cell }
  | { type: 'damaged'; entity: EntityId; amount: number; source?: EntityId }
  | { type: 'died'; entity: EntityId }
  | { type: 'resource:overflow'; entity: EntityId; resourceId: string; excess: number; cause: string }
  | { type: 'resource:underflow'; entity: EntityId; resourceId: string; deficit: number; cause: string }
  // Content extends this union via declaration-merged EventMap in later work.
  | { type: string; [key: string]: unknown };

export type EventListener = (ev: GameEvent) => void;

export interface EventBus {
  /** Subscribe to a `type`; returns an unsubscribe function. */
  on(type: string, fn: EventListener): () => void;
  /** Publish an event to its subscribers. */
  emit(ev: GameEvent): void;
}

/**
 * Create a synchronous event bus with deterministic, registration-order
 * delivery. Pure pub/sub — the reaction cascade is driven by the reaction loop.
 */
export function createEventBus(): EventBus {
  const listeners = new Map<string, EventListener[]>();
  return {
    on(type, fn) {
      let arr = listeners.get(type);
      if (!arr) {
        arr = [];
        listeners.set(type, arr);
      }
      arr.push(fn);
      return () => {
        const a = listeners.get(type);
        if (!a) return;
        const i = a.indexOf(fn);
        if (i >= 0) a.splice(i, 1);
      };
    },
    emit(ev) {
      const arr = listeners.get(ev.type);
      if (!arr) return;
      // Iterate a copy so a handler that (un)subscribes doesn't shift the pass.
      for (const fn of arr.slice()) fn(ev);
    },
  };
}

/**
 * The reaction loop (§7.3): events emitted during effect application can
 * provoke further reactions, so they are NEVER processed recursively. Emitted
 * events drain through a FIFO to a fixed point — each event is delivered to bus
 * subscribers (log/UI), then `collectReactions` gathers the follow-up actions
 * its post-phase reactors produce, each is `resolve`d, and the resulting events
 * are enqueued. A configurable depth guard breaks pathological cascades
 * (fire→oil→fire) and logs.
 *
 * The loop is parameterized by injected `collectReactions`/`resolve` callbacks
 * so `core` never imports `sim`: the action handlers and reactor gathering live
 * in `sim` and are wired in at the composition edge.
 */
export interface ReactionLoop {
  /** Enqueue an event without draining (use inside a drain). */
  publish(event: GameEvent): void;
  /** Drain the queue to a fixed point (or until the depth guard trips). */
  drain(): void;
  /** Seed the queue with `events` and drain — the normal entry point. */
  run(events: readonly GameEvent[]): void;
}

export interface ReactionLoopOptions {
  bus: EventBus;
  /** Follow-up actions produced by an event's post-phase reactors. */
  collectReactions: (event: GameEvent) => Action[];
  /** Resolve a follow-up action; its events feed back onto the queue. */
  resolve: (action: Action) => ActionOutcome;
  /** Max drain iterations before the guard trips (§7.3). */
  maxDepth: number;
  /**
   * Called when the depth guard trips. Defaults to a no-op — `core` has no log
   * sink (headless, DOM-free); the composition edge wires a warning logger.
   */
  onDepthExceeded?: (event: GameEvent, depth: number) => void;
}

const NOOP_DEPTH_HANDLER = (): void => {};

export function createReactionLoop(opts: ReactionLoopOptions): ReactionLoop {
  const { bus, collectReactions, resolve, maxDepth } = opts;
  const onDepthExceeded = opts.onDepthExceeded ?? NOOP_DEPTH_HANDLER;

  const queue: GameEvent[] = [];
  let draining = false;

  const publish = (event: GameEvent): void => {
    queue.push(event);
  };

  const drain = (): void => {
    if (draining) return; // re-entrant publish just appends to the active drain
    draining = true;
    let depth = 0;
    try {
      while (queue.length > 0) {
        if (depth >= maxDepth) {
          onDepthExceeded(queue[0]!, depth);
          queue.length = 0;
          break;
        }
        const event = queue.shift()!;
        bus.emit(event); // subscribers / log observe
        for (const action of collectReactions(event)) {
          const outcome = resolve(action);
          if (outcome.status !== 'rejected') {
            for (const e of outcome.events) queue.push(e);
          }
        }
        depth++;
      }
    } finally {
      draining = false;
    }
  };

  return {
    publish,
    drain,
    run(events) {
      for (const e of events) queue.push(e);
      drain();
    },
  };
}
