import { describe, it, expect } from 'vitest';
import { createEventBus } from '../../src/core/events';
import { createMessageLog } from '../../src/ui/log';

describe('message log (§12)', () => {
  it('formats events into text via the template table', () => {
    const bus = createEventBus();
    const log = createMessageLog(bus, {
      moved: '{entity} moves.',
      damaged: '{entity} takes {amount} damage.',
    });
    bus.emit({ type: 'moved', entity: 'goblin', from: 0, to: 1 });
    bus.emit({ type: 'damaged', entity: 'hero', amount: 5 });
    expect(log.messages()).toEqual(['goblin moves.', 'hero takes 5 damage.']);
  });

  it('ignores events without a template, and leaves unknown fields as-is', () => {
    const bus = createEventBus();
    const log = createMessageLog(bus, { moved: '{entity} → {missing}' });
    bus.emit({ type: 'died', entity: 'x' }); // no template
    bus.emit({ type: 'moved', entity: 'rat', from: 0, to: 1 });
    expect(log.messages()).toEqual(['rat → {missing}']);
  });

  it('resolves {field} values through the resolve hook (e.g. id → name)', () => {
    const bus = createEventBus();
    const names: Record<string, string> = { goblin: 'Goblin', hero: 'Player' };
    const log = createMessageLog(
      bus,
      { died: '{entity} is slain by {source}.' },
      { resolve: (field, value) => (field === 'entity' || field === 'source' ? names[String(value)] : undefined) },
    );
    bus.emit({ type: 'died', entity: 'goblin', source: 'hero' });
    // entity + source resolved to names; a missing name falls back to the raw id.
    expect(log.messages()).toEqual(['Goblin is slain by Player.']);

    bus.emit({ type: 'died', entity: 'rat', source: 'hero' });
    expect(log.messages().at(-1)).toBe('rat is slain by Player.'); // 'rat' has no name → raw id
  });

  it('caps the ring buffer and supports direct add + dispose', () => {
    const bus = createEventBus();
    const log = createMessageLog(bus, { moved: '{entity}' }, 3);
    for (let i = 0; i < 5; i++) bus.emit({ type: 'moved', entity: `e${i}`, from: 0, to: 1 });
    expect(log.messages()).toEqual(['e2', 'e3', 'e4']); // oldest dropped

    log.add('system message');
    expect(log.messages().at(-1)).toBe('system message');

    log.dispose();
    bus.emit({ type: 'moved', entity: 'after', from: 0, to: 1 });
    expect(log.messages()).not.toContain('after'); // no longer subscribed
  });
});
