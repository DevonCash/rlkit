/**
 * command-to-action — translate a command into the player's action (§14).
 *
 * Pure: movement commands become a `move` in the matching `DIRS8` direction
 * (the move handler decides relocate/attack/swap/bump); `wait` becomes a wait; UI
 * commands (`open-inventory`/`pickup`/`open-targeting`/`confirm`/`cancel`)
 * become a `UIIntent` the stateful session executes. Returns `undefined` for an
 * unrecognized command.
 */
import type { Command } from './command';
import type { Action } from '../core/action';
import type { EntityId } from '../core/entity';
import type { Point } from '../core/coords';
import { DIRS8 } from '../core/coords';

export interface UIIntent {
  ui: string;
}

export interface CommandContext {
  player: EntityId;
}

// DIRS8 order: N, NE, E, SE, S, SW, W, NW.
const MOVE: Readonly<Record<string, Point>> = {
  'move-north': DIRS8[0]!,
  'move-ne': DIRS8[1]!,
  'move-east': DIRS8[2]!,
  'move-se': DIRS8[3]!,
  'move-south': DIRS8[4]!,
  'move-sw': DIRS8[5]!,
  'move-west': DIRS8[6]!,
  'move-nw': DIRS8[7]!,
};

const UI_COMMANDS = new Set(['open-inventory', 'pickup', 'open-targeting', 'confirm', 'cancel']);

export function isUIIntent(r: Action | UIIntent | undefined): r is UIIntent {
  return r !== undefined && 'ui' in r;
}

/** The direction of a movement command (`move-*`), or undefined. */
export function moveDirection(commandType: string): Point | undefined {
  return MOVE[commandType];
}

export function commandToAction(cmd: Command, ctx: CommandContext): Action | UIIntent | undefined {
  const dir = MOVE[cmd.type];
  if (dir) return { type: 'move', actor: ctx.player, dir };
  if (cmd.type === 'wait') return { type: 'wait', actor: ctx.player };
  if (UI_COMMANDS.has(cmd.type)) return { ui: cmd.type };
  return undefined;
}
