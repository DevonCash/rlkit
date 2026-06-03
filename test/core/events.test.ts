import { describe, it, expect } from 'vitest';
import { createEventBus, type GameEvent } from '../../src/core/events';

describe('event bus', () => {
  it('delivers to subscribers of the matching type', () => {
    const bus = createEventBus();
    const seen: GameEvent[] = [];
    bus.on('moved', (ev) => seen.push(ev));
    bus.on('died', () => seen.push({ type: 'other' }));

    bus.emit({ type: 'moved', entity: 'e', from: 0, to: 1 });
    expect(seen).toEqual([{ type: 'moved', entity: 'e', from: 0, to: 1 }]);
  });

  it('fires subscribers in registration order', () => {
    const bus = createEventBus();
    const order: number[] = [];
    bus.on('died', () => order.push(1));
    bus.on('died', () => order.push(2));
    bus.on('died', () => order.push(3));
    bus.emit({ type: 'died', entity: 'e' });
    expect(order).toEqual([1, 2, 3]);
  });

  it('unsubscribe stops delivery', () => {
    const bus = createEventBus();
    let count = 0;
    const off = bus.on('moved', () => count++);
    bus.emit({ type: 'moved', entity: 'e', from: 0, to: 1 });
    off();
    bus.emit({ type: 'moved', entity: 'e', from: 1, to: 2 });
    expect(count).toBe(1);
  });

  it('a handler unsubscribing mid-emit does not disturb the current pass', () => {
    const bus = createEventBus();
    const order: number[] = [];
    let off2 = () => {};
    bus.on('died', () => {
      order.push(1);
      off2(); // remove the next handler during the pass
    });
    off2 = bus.on('died', () => order.push(2));
    bus.on('died', () => order.push(3));
    bus.emit({ type: 'died', entity: 'e' });
    // Snapshot semantics: handler 2 still runs this pass; removed for the next.
    expect(order).toEqual([1, 2, 3]);
    order.length = 0;
    bus.emit({ type: 'died', entity: 'e' });
    expect(order).toEqual([1, 3]);
  });
});
