import { describe, it, expect, vi } from 'vitest';
import { createEventBus, createReactionLoop } from '../../src/core/events';
import type { GameEvent } from '../../src/core/events';
import type { Action, ActionOutcome } from '../../src/core/action';

const done = (events: GameEvent[] = []): ActionOutcome => ({ status: 'done', cost: 0, events });

describe('reaction loop', () => {
  it('drains events FIFO and delivers to subscribers in order', () => {
    const bus = createEventBus();
    const seen: string[] = [];
    bus.on('a', () => seen.push('a'));
    bus.on('b', () => seen.push('b'));
    bus.on('c', () => seen.push('c'));

    const loop = createReactionLoop({
      bus,
      collectReactions: () => [],
      resolve: () => done(),
      maxDepth: 64,
    });
    loop.run([{ type: 'a' }, { type: 'b' }, { type: 'c' }]);
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('resolves reactor-returned actions and feeds their events back (no recursion)', () => {
    const bus = createEventBus();
    const order: string[] = [];
    bus.on('seed', () => order.push('seed'));
    bus.on('followup', () => order.push('followup'));

    const loop = createReactionLoop({
      bus,
      // A 'seed' event provokes one follow-up action.
      collectReactions: (ev) => (ev.type === 'seed' ? [{ type: 'react', actor: 'x' }] : []),
      // Resolving that action emits a 'followup' event.
      resolve: (a: Action) => (a.type === 'react' ? done([{ type: 'followup' }]) : done()),
      maxDepth: 64,
    });
    loop.run([{ type: 'seed' }]);
    expect(order).toEqual(['seed', 'followup']);
  });

  it('depth guard breaks a self-feeding cascade and logs', () => {
    const bus = createEventBus();
    let delivered = 0;
    bus.on('fire', () => delivered++);
    const onDepthExceeded = vi.fn();

    const loop = createReactionLoop({
      bus,
      // fire → ignite action → fire → ... an infinite cascade.
      collectReactions: (ev) => (ev.type === 'fire' ? [{ type: 'ignite', actor: 'oil' }] : []),
      resolve: () => done([{ type: 'fire' }]),
      maxDepth: 10,
      onDepthExceeded,
    });
    loop.run([{ type: 'fire' }]);

    expect(onDepthExceeded).toHaveBeenCalledOnce();
    expect(delivered).toBe(10); // exactly maxDepth iterations, then it stops
  });

  it('is deterministic: identical inputs produce identical delivery order', () => {
    const make = () => {
      const bus = createEventBus();
      const seen: string[] = [];
      bus.on('x', () => seen.push('x'));
      bus.on('y', () => seen.push('y'));
      const loop = createReactionLoop({
        bus,
        collectReactions: (ev) =>
          ev.type === 'x' ? [{ type: 'a', actor: '1' }, { type: 'a', actor: '2' }] : [],
        resolve: (a) => (a.type === 'a' ? done([{ type: 'y' }]) : done()),
        maxDepth: 64,
      });
      loop.run([{ type: 'x' }]);
      return seen;
    };
    expect(make()).toEqual(make());
    expect(make()).toEqual(['x', 'y', 'y']);
  });
});
