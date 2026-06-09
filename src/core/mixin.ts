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
 * Those reactor hooks are read-only (they return actions; mutation happens
 * downstream). The exception is `onActorTick` (§9.4): it runs inside `tickActor`'s
 * per-actor mutation pass — alongside the status tick — so it MAY mutate directly
 * (via `changeResource`) and returns the events it caused.
 *
 * `modifyStats` (a pure derived-value contribution, NOT a reactor) is added in
 * milestone 4 alongside the stat block.
 */
import type { Action, ActionContext } from './action';
import type { Entity } from './entity';
import type { GameEvent } from './events';
import type { ReadonlyWorld, World } from './world';
import type { StatModifier } from './stats';
import { createRegistry, type Registry } from './registry';

export interface Mixin {
  name: string;
  /** Component types this mixin needs present on its entity. */
  requires: string[];
  /** Pre-phase, cancelable reaction against the mutable action context. */
  onAction?(ctx: ActionContext, self: Entity): void;
  /** Post-phase reaction to an event; may enqueue follow-up actions. */
  onEvent?(ev: GameEvent, self: Entity, world: ReadonlyWorld): Action[] | void;
  /**
   * Pure contribution to derived stats (§9.1) — NOT a reactor. Returns typed
   * modifiers that `deriveStats` applies in fixed phase order; it never mutates
   * world state, so it's safe to call any time stats are recomputed.
   */
  modifyStats?(self: Entity, world: ReadonlyWorld): StatModifier[];
  /**
   * Decide this entity's action on its turn (§11.2) — the AI hook. Returns an
   * `Action`, or `undefined` to decline (the next AI mixin in declared order
   * gets a try — a priority stack). Read-only; the driver feeds the chosen
   * action to `resolve`/`perform`. `DesireAI` (M6b) implements this too.
   */
  takeTurn?(self: Entity, world: ReadonlyWorld): Action | undefined;
  /**
   * Passive per-actor-turn effect (§9.4): runs inside `tickActor`'s mutation pass,
   * after the built-in regen + status tick, once per one of this entity's turns.
   * Unlike the read-only reactor hooks it MAY mutate — it shares `tickActor`'s
   * mutation context, exactly like the status tick beside it — and returns the
   * events it caused (which flow through the reaction loop, so emitting `died`
   * unschedules the actor via the death reactor). Mutate through `changeResource`
   * (the bounded, event-emitting helper); this is NOT the effect pipeline, so don't
   * reach for raw `world.state` writes. Should be defensive: read its component(s)
   * and return `[]` if absent.
   */
  onActorTick?(self: Entity, world: World): GameEvent[];
}

export type MixinRegistry = Registry<Mixin>;

/** Typed view of the mixin registry (centralizes the one downcast). */
export function mixinRegistryOf(world: ReadonlyWorld): MixinRegistry {
  return world.services.registries.mixins as MixinRegistry;
}

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
