/**
 * command — input command types (§14).
 *
 * Input is an adapter that converts raw events into engine *commands*; the
 * driver/session translates a command into the player's `Action`. Commands are
 * an abstraction layer so key, pointer, and scripted input share one set.
 */
export interface Command {
  type: string;
  [key: string]: unknown;
}

/** A configurable map of normalized key combo → command id (§14). */
export type Keymap = Readonly<Record<string, string>>;

export interface InputSource {
  /** Subscribe to commands emitted by this source. */
  onCommand(fn: (cmd: Command) => void): void;
}
