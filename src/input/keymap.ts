/**
 * keymap — key combo → command lookup (§14).
 *
 * Pure table lookup; the combo string is produced by the input adapter
 * (`keyComboOf`) so this stays a simple, configurable map. The default keymap
 * lives in `config.keymap` (vi-keys + arrows + numpad).
 */
import type { Command, Keymap } from './command';

/** Resolve a normalized key combo to its command, or `undefined` if unbound. */
export function mapKey(keymap: Keymap, combo: string): Command | undefined {
  const id = keymap[combo];
  return id === undefined ? undefined : { type: id };
}
