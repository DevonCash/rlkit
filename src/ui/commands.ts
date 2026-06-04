/**
 * commands — the session's command-dispatch registry (§14/§15).
 *
 * A `Command` (from a keystroke, pointer, or a modal selection) is routed to a
 * `CommandHandler` looked up by `command.type`. The session ships a default
 * table that reproduces the built-in behavior (movement, wait, inventory,
 * pickup, targeting, and the item-interaction default); games register or
 * override entries to add their own commands (descend, save, load, …) without
 * forking the session. The handler receives a `CommandCtx` whose `submit` feeds
 * the driver and re-renders — the one door every command, keystroke or menu,
 * goes through.
 */
import type { World } from '../core/world';
import type { EntityId } from '../core/entity';
import type { Action } from '../core/action';
import type { Command } from '../input/command';
import type { Modal } from './stack';

/** The context a command handler operates on. */
export interface CommandCtx {
  readonly world: World;
  readonly player: EntityId;
  /** Feed an action to the driver (advance one turn) and re-render. */
  submit(action: Action): void;
  /** Push a modal onto the UI stack and re-render. */
  pushModal(modal: Modal): void;
  /** Re-enter command routing with another command (used by modals on select). */
  dispatch(cmd: Command): void;
  /** Re-render the current frame. */
  render(): void;
}

/** A command handler: inspect the command and submit actions / push modals. */
export type CommandHandler = (cmd: Command, ctx: CommandCtx) => void;

/** A name → handler table; merged over the session defaults. */
export type CommandTable = Record<string, CommandHandler>;
