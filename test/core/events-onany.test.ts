/**
 * EventBus.onAny wildcard (§6.5, R4): every event delivered once, in
 * emission/cascade (FIFO) order, after its type listeners.
 */
import { describe, it, expect } from 'vitest';
import { createEventBus, createReactionLoop } from '../../src/core/events';
import type { GameEvent, ActionOutcome } from '../../src/index';
import type { Action } from '../../src/index';

describe('EventBus.onAny (§6.5)', () => {
  it('sees every event exactly once, in order, after type listeners', () => {
    const bus = createEventBus();
    const order: string[] = [];
    bus.on('a', () => order.push('type:a'));
    const unsub = bus.onAny((ev) => order.push(`any:${ev.type}`));
    bus.emit({ type: 'a' } as GameEvent);
    bus.emit({ type: 'b' } as GameEvent);
    expect(order).toEqual(['type:a', 'any:a', 'any:b']);

    unsub();
    bus.emit({ type: 'c' } as GameEvent);
    expect(order).toEqual(['type:a', 'any:a', 'any:b']); // unsubscribed
  });

  it('captures cascaded events in FIFO order with no double-delivery', () => {
    const bus = createEventBus();
    const seen: string[] = [];
    bus.onAny((ev) => seen.push(ev.type));

    // A → (reactor) → action 'x' → resolves to event B.
    const loop = createReactionLoop({
      bus,
      collectReactions: (ev: GameEvent): Action[] =>
        ev.type === 'A' ? [{ type: 'x', actor: '_' }] : [],
      resolve: (a: Action): ActionOutcome =>
        a.type === 'x' ? { status: 'done', cost: 0, events: [{ type: 'B' } as GameEvent] } : { status: 'rejected', reason: 'no' },
      maxDepth: 16,
    });
    loop.run([{ type: 'A' } as GameEvent]);
    expect(seen).toEqual(['A', 'B']); // A drained first, then its cascade B — once each
  });
});
