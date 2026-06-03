/**
 * input — the keyboard input adapter (§14).
 *
 * Converts raw key events into commands via the keymap. The DOM is typed
 * STRUCTURALLY (the M7 `Ctx2D` pattern): `KeyboardInput` accepts an
 * `EventTargetLike` and a `KeyLikeEvent`, so it ships in the headless library
 * with no DOM lib and unit-tests with a fake target — a real `window` is
 * structurally assignable. The browser wiring lives in `examples/web`.
 */
import type { Command, InputSource, Keymap } from './command';
import { mapKey } from './keymap';

/** The subset of a keyboard event this adapter reads (no DOM lib). */
export interface KeyLikeEvent {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  preventDefault?(): void;
}

/** The subset of an event target this adapter uses (a real `window` fits). */
export interface EventTargetLike {
  addEventListener(type: string, listener: (ev: KeyLikeEvent) => void): void;
  removeEventListener?(type: string, listener: (ev: KeyLikeEvent) => void): void;
}

/**
 * Normalize a key event to a combo string: `ctrl+`/`alt+` prefixes (canonical
 * order) plus the key. Shift is reflected in `key` itself (e.g. `K`), so it is
 * not prefixed, keeping the keymap unambiguous.
 */
export function keyComboOf(ev: KeyLikeEvent): string {
  let combo = '';
  if (ev.ctrlKey) combo += 'ctrl+';
  if (ev.altKey) combo += 'alt+';
  return combo + ev.key;
}

export class KeyboardInput implements InputSource {
  private listeners: Array<(cmd: Command) => void> = [];

  constructor(target: EventTargetLike, keymap: Keymap) {
    target.addEventListener('keydown', (ev) => {
      const cmd = mapKey(keymap, keyComboOf(ev));
      if (!cmd) return;
      ev.preventDefault?.();
      for (const fn of this.listeners) fn(cmd);
    });
  }

  onCommand(fn: (cmd: Command) => void): void {
    this.listeners.push(fn);
  }
}
