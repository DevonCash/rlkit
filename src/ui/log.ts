/**
 * log — the message log model (§12).
 *
 * A bus subscriber that turns events into player-facing text via a config
 * template table (event type → template string with `{field}` interpolation
 * from the event payload), buffered in a capped ring. The core emits events; it
 * never formats strings. The scrollable VIEW of this buffer is the UI's job
 * (§15, milestone 8) — this is just the headless data model.
 */
import type { EventBus, GameEvent } from '../core/events';

export interface MessageLog {
  /** The buffered messages, oldest first. */
  messages(): readonly string[];
  /** Append a message directly (e.g. system text). */
  add(text: string): void;
  /** Unsubscribe from the bus. */
  dispose(): void;
}

function format(template: string, ev: GameEvent): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = (ev as Record<string, unknown>)[key];
    return v === undefined ? `{${key}}` : String(v);
  });
}

/**
 * Subscribe to the bus and format matching events into a capped buffer. One
 * subscription per template key (the event types the game cares to narrate).
 */
export function createMessageLog(
  bus: EventBus,
  templates: Readonly<Record<string, string>>,
  capacity = 200,
): MessageLog {
  const buffer: string[] = [];
  const unsubs: Array<() => void> = [];

  const push = (text: string): void => {
    buffer.push(text);
    if (buffer.length > capacity) buffer.shift();
  };

  for (const [type, template] of Object.entries(templates)) {
    unsubs.push(bus.on(type, (ev) => push(format(template, ev))));
  }

  return {
    messages: () => buffer,
    add: push,
    dispose: () => {
      for (const u of unsubs) u();
      unsubs.length = 0;
    },
  };
}
