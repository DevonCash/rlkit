/**
 * bump — the bump action handler (§7.4).
 *
 * "Walk into the thing in front of me." Resolves by what occupies the target
 * cell:
 *   - empty            → move there
 *   - a `swappable`    → swap positions (two validated move effects)
 *   - else, if an `attack` handler is registered → dispatch attack (M4 wires
 *                        the handler; until then this branch is unreachable)
 *   - otherwise        → fizzle (blocked; turn spent)
 *
 * The branch dispatch uses ts-pattern `.exhaustive()` so a new bump outcome
 * can't be added without handling it.
 */
import { match } from 'ts-pattern';
import { get } from '../../core/entity';
import type { EntityId } from '../../core/entity';
import { cellOf } from '../../core/coords';
import type { Position } from '../../core/component';
import type { ActionContext } from '../../core/action';
import { makeMoveEffect } from './move';

type BumpOutcome =
  | { kind: 'free'; toX: number; toY: number }
  | { kind: 'swap'; toX: number; toY: number; other: EntityId }
  | { kind: 'attack'; target: EntityId }
  | { kind: 'blocked' };

export function bumpHandler(ctx: ActionContext): void {
  const action = ctx.action;
  if (action.type !== 'bump') return;
  const dir = action.dir as { x: number; y: number };

  const actor = ctx.world.state.entities.get(action.actor);
  const pos = actor && get<Position>(actor, 'position');
  if (!pos) {
    ctx.reject('bump: actor has no position');
    return;
  }
  const level = ctx.world.state.levels.get(pos.levelId);
  if (!level) {
    ctx.reject('bump: actor is on an unknown level');
    return;
  }
  const toX = pos.x + dir.x;
  const toY = pos.y + dir.y;
  if (toX < 0 || toX >= level.width || toY < 0 || toY >= level.height) {
    ctx.reject('bump: destination out of bounds');
    return;
  }

  const targetCell = cellOf({ x: toX, y: toY }, level.width);
  const handlers = ctx.world.services.registries.handlers;
  let outcome: BumpOutcome = { kind: 'free', toX, toY };

  for (const id of ctx.world.services.queries.at(targetCell, pos.levelId)) {
    if (id === action.actor) continue;
    const other = ctx.world.state.entities.get(id);
    if (other && other.mixins.includes('swappable')) {
      outcome = { kind: 'swap', toX, toY, other: id };
    } else if (handlers?.has('attack')) {
      outcome = { kind: 'attack', target: id };
    } else {
      outcome = { kind: 'blocked' };
    }
    break; // resolve against the first occupant
  }

  match(outcome)
    .with({ kind: 'free' }, ({ toX: x, toY: y }) => {
      ctx.push(makeMoveEffect(action.actor, x, y));
    })
    .with({ kind: 'swap' }, ({ toX: x, toY: y, other }) => {
      // Two effects, validated together then applied together (atomicity):
      // actor → target cell, occupant → actor's old cell.
      ctx.push(makeMoveEffect(action.actor, x, y));
      ctx.push(makeMoveEffect(other, pos.x, pos.y));
    })
    .with({ kind: 'attack' }, ({ target }) => {
      // Re-dispatch as a full attack so the target's reactors fire (§7.2).
      ctx.redirect({ type: 'attack', actor: action.actor, target });
    })
    .with({ kind: 'blocked' }, () => {
      ctx.fizzle('bump: blocked');
    })
    .exhaustive();
}
