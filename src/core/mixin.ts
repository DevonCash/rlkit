/**
 * mixin — composable behavior attached to entities by name (§5.3).
 *
 * A mixin bundles behavior over an entity's components and hooks into the
 * action/event pipeline. `onAction` and `onEvent` are sugar for entity-scoped
 * reactors (§7.3): `onAction` is a pre-phase, cancelable reaction; `onEvent` is
 * a post-phase reaction that may enqueue follow-up actions. Entities reference
 * mixins by *name* (serialize-by-name, §6.3); resolution order is the entity's
 * declared array order (decision §21.5).
 *
 * `modifyStats` (a pure derived-value contribution, NOT a reactor) is added in
 * milestone 4 alongside the stat block.
 */
import type { Action, ActionContext } from './action';
import type { Entity } from './entity';
import type { GameEvent } from './events';
import type { ReadonlyWorld } from './world';
import { createRegistry, type Registry } from './registry';

export interface Mixin {
  name: string;
  /** Component types this mixin needs present on its entity. */
  requires: string[];
  /** Pre-phase, cancelable reaction against the mutable action context. */
  onAction?(ctx: ActionContext, self: Entity): void;
  /** Post-phase reaction to an event; may enqueue follow-up actions. */
  onEvent?(ev: GameEvent, self: Entity, world: ReadonlyWorld): Action[] | void;
}

export type MixinRegistry = Registry<Mixin>;

export function createMixinRegistry(): MixinRegistry {
  return createRegistry<Mixin>('mixin');
}

/**
 * Resolve an entity's mixin *names* to their live definitions, in the entity's
 * declared order. Unknown names are skipped (a missing mixin is a content bug
 * surfaced elsewhere, not a crash in dispatch).
 */
export function resolveMixins(entity: Entity, registry: MixinRegistry): Mixin[] {
  const out: Mixin[] = [];
  for (const name of entity.mixins) {
    const def = registry.tryGet(name);
    if (def) out.push(def);
  }
  return out;
}
