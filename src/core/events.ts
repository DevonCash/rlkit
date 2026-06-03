/**
 * events — the typed event union and the event bus (§7.2, §12).
 *
 * `GameEvent` is a discriminated union on `type`; dispatch sites use ts-pattern
 * and stay exhaustive over core variants, falling through to a catch-all for
 * content-defined events. Events are runtime-only — never serialized — so they
 * stay plain interfaces, not Zod schemas (§16.4).
 *
 * M1 ships a simple synchronous bus with deterministic (registration-order)
 * delivery. The FIFO reaction loop + depth guard and the reactor model
 * (pre/post phases, scopes) are part of the action pipeline and land in
 * milestone 2 — see the TODO seam below.
 */
import type { Cell } from './coords';
import type { EntityId } from './entity';

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
 * delivery.
 *
 * TODO(milestone 2): replace direct dispatch with the reaction loop — emitted
 * events enqueue onto a FIFO drained to a fixed point, with a configurable
 * depth guard, so "fire ignites oil ignites fire" cannot recurse the stack
 * (§7.3). The `EventBus` surface stays the same; `emit` changes from immediate
 * to enqueue-and-drain.
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
