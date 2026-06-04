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

/**
 * Optionally rewrite an interpolated `{field}` value before it is stringified —
 * e.g. resolve an entity id to a display name. Return `undefined` to fall back
 * to the default (`String(value)`). The log model stays headless: a game's
 * resolver closes over whatever it needs (the world, a name table).
 */
export type FieldResolver = (field: string, value: unknown, ev: GameEvent) => string | undefined;

export interface MessageLogOptions {
  capacity?: number;
  resolve?: FieldResolver;
}

function format(template: string, ev: GameEvent, resolve?: FieldResolver): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = (ev as Record<string, unknown>)[key];
    const resolved = resolve?.(key, v, ev);
    if (resolved !== undefined) return resolved;
    return v === undefined ? `{${key}}` : String(v);
  });
}

/**
 * Subscribe to the bus and format matching events into a capped buffer. One
 * subscription per template key (the event types the game cares to narrate).
 * The third argument is either a numeric capacity (back-compat) or an options
 * object carrying `capacity` and a `resolve` hook for naming `{field}` values.
 */
export function createMessageLog(
  bus: EventBus,
  templates: Readonly<Record<string, string>>,
  options: number | MessageLogOptions = {},
): MessageLog {
  const opts: MessageLogOptions = typeof options === 'number' ? { capacity: options } : options;
  const capacity = opts.capacity ?? 200;
  const buffer: string[] = [];
  const unsubs: Array<() => void> = [];

  const push = (text: string): void => {
    buffer.push(text);
    if (buffer.length > capacity) buffer.shift();
  };

  for (const [type, template] of Object.entries(templates)) {
    unsubs.push(bus.on(type, (ev) => push(format(template, ev, opts.resolve))));
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
