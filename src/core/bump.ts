/**
 * bump — the bump-interaction dispatch (§7.2, R7).
 *
 * When an actor bumps a non-passable, non-swappable occupant, the move handler
 * asks this registry "what does bumping this target mean?" instead of hardcoding
 * attack. Mechanics register `on:bump` rules `(ctx) => Action | 'block' |
 * undefined`, tried HIGH-TO-LOW priority with registration order as the
 * deterministic tiebreak; the first non-`undefined` result wins. An `Action` is
 * redirected to (so the interaction is the actor's action, inheriting its cost);
 * `'block'` claims the bump as a no-op block (suppressing lower-priority rules);
 * no claim at all → blocked. Attack-on-bump is just the default (lowest-priority)
 * rule — a game can shadow it with a higher-priority `'block'`/swap rule for
 * intent-based combat.
 *
 * A SERVICE, reconstructed on load (rules are re-registered, never serialized).
 */
import type { Action } from './action';
import type { Cell } from './coords';
import type { EntityId } from './entity';
import type { ReadonlyWorld } from './world';

/** Claim a bump as a no-op block (stops lower-priority rules from claiming it). */
export const BLOCK = 'block';
export type BumpResult = Action | typeof BLOCK | undefined;

export interface BumpContext {
  readonly world: ReadonlyWorld;
  /** The bumping actor. */
  readonly actor: EntityId;
  /** The bumped occupant. */
  readonly target: EntityId;
  /** The target cell. */
  readonly cell: Cell;
}

export interface BumpInteraction {
  /** Higher runs first; ties break by registration order. */
  priority: number;
  /** Return an Action to redirect to, `'block'` to block, or `undefined` to pass. */
  claim(ctx: BumpContext): BumpResult;
}

export interface BumpInteractionRegistry {
  register(interaction: BumpInteraction): void;
  /** The winning interaction for a bump (Action / `'block'` / `undefined` = no claim). */
  resolve(ctx: BumpContext): BumpResult;
}

export function createBumpInteractionRegistry(): BumpInteractionRegistry {
  const entries: Array<{ interaction: BumpInteraction; seq: number }> = [];
  let nextSeq = 0;
  let sorted = true;

  return {
    register(interaction) {
      entries.push({ interaction, seq: nextSeq++ });
      sorted = false;
    },
    resolve(ctx) {
      if (!sorted) {
        // High-to-low priority, registration order as the deterministic tiebreak.
        entries.sort((a, b) => b.interaction.priority - a.interaction.priority || a.seq - b.seq);
        sorted = true;
      }
      for (const { interaction } of entries) {
        const r = interaction.claim(ctx);
        if (r !== undefined) return r;
      }
      return undefined;
    },
  };
}
