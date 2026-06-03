/**
 * reactors — entity + global reactor gathering for the pipeline (§7.3).
 *
 * Pre-phase (`onAction`) reactors fire before effects apply against the mutable
 * `ActionContext`; post-phase (`onEvent`) reactors fire after, per event, and
 * may enqueue follow-up actions. Firing order is fixed and deterministic:
 * **actor → target → global** (decision: M2). Within an entity, mixins run in
 * the entity's declared array order; global reactors in registration order.
 *
 * `cell`/`zone` scopes exist in the model but have no dispatch path until
 * triggers/zones land in milestone 11.
 */
import { resolveMixins } from '../core/mixin';
import type { MixinRegistry } from '../core/mixin';
import type { Action, ActionContext } from '../core/action';
import type { GameEvent } from '../core/events';
import type { ReactorRegistry } from '../core/reactor';
import type { Entity, EntityId } from '../core/entity';
import type { ReadonlyWorld, World } from '../core/world';

function mixinRegistry(world: ReadonlyWorld): MixinRegistry {
  return world.services.registries.mixins as unknown as MixinRegistry;
}

function reactorRegistry(world: ReadonlyWorld): ReactorRegistry {
  return world.services.reactors;
}

/** Entities whose mixins fire for `action`, in order: actor, then target. */
function involvedEntities(world: ReadonlyWorld, action: Action): Entity[] {
  const out: Entity[] = [];
  const actor = world.state.entities.get(action.actor);
  if (actor) out.push(actor);
  const targetId = (action as { target?: unknown }).target;
  if (typeof targetId === 'string' && targetId !== action.actor) {
    const target = world.state.entities.get(targetId);
    if (target) out.push(target);
  }
  return out;
}

/** Fire pre-phase reactors against the mutable context (actor → target → global). */
export function runPreReactors(world: World, ctx: ActionContext): void {
  const mixins = mixinRegistry(world);
  for (const self of involvedEntities(world, ctx.action)) {
    for (const mixin of resolveMixins(self, mixins)) {
      mixin.onAction?.(ctx, self);
    }
  }
  for (const r of reactorRegistry(world).pre(ctx.action.type)) r.react(ctx);
}

/** Gather follow-up actions from post-phase reactors for `event` (entity → global). */
export function collectReactions(world: World, event: GameEvent): Action[] {
  const out: Action[] = [];
  const mixins = mixinRegistry(world);

  const entityId = (event as { entity?: unknown }).entity;
  if (typeof entityId === 'string') {
    const self = world.state.entities.get(entityId as EntityId);
    if (self) {
      for (const mixin of resolveMixins(self, mixins)) {
        const actions = mixin.onEvent?.(event, self, world);
        if (actions) out.push(...actions);
      }
    }
  }

  for (const r of reactorRegistry(world).post(event.type)) {
    const actions = r.react({ event, world });
    if (actions) out.push(...actions);
  }
  return out;
}
