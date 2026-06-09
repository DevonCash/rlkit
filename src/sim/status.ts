/**
 * status — timed bundles over the primitives (§9.4).
 *
 * A status effect is a registry-defined bundle of stat modifiers and/or a
 * per-tick resource delta, so poison/regen/burning/haste need no bespoke code.
 * `deriveStats` (sim/stats.ts) already folds active-status modifiers, so
 * haste→+speed flows through the stat pipeline automatically.
 *
 * `tickActor` advances an entity's statuses on the PER-ACTOR clock (§7.3): one
 * call = one of that actor's turns. There is no driver yet (M7) — the driver
 * will call this on each actor turn; until then it is exercised directly.
 */
import { get, set, type Entity } from '../core/entity';
import type { Component } from '../core/component';
import type { GameEvent } from '../core/events';
import type { StatModifier } from '../core/stats';
import type { World } from '../core/world';
import type { Effect } from '../core/action';
import type { Registry } from '../core/registry';
import { mixinRegistryOf } from '../core/mixin';
import { changeResource, resourceRegistryOf } from './resources';

export interface StatusDef {
  id: string;
  /** Folded into deriveStats while active (e.g. haste → +speed). */
  modifiers?: StatModifier[];
  /** Applied once per per-actor tick (e.g. poison → hp −n). */
  onTick?: { resourceId: string; amount: number; cause: string };
  /** Event type emitted when the status expires. */
  onExpire?: string;
}
export type StatusDefRegistry = Registry<StatusDef>;

/** Typed view of the status registry (centralizes the one downcast). */
export function statusRegistryOf(world: World): StatusDefRegistry {
  return world.services.registries.statuses as StatusDefRegistry;
}

interface ActiveStatus {
  effectId: string;
  duration: number;
  stacks?: number;
}
interface StatusesComponent extends Component {
  type: 'statuses';
  active: ActiveStatus[];
}

/** Register the batteries-included proof status defs (overridable content). */
export function registerCoreStatuses(reg: StatusDefRegistry, hasteSpeed: number): void {
  reg.register('poison', {
    id: 'poison',
    onTick: { resourceId: 'hp', amount: -1, cause: 'damage' },
    onExpire: 'status:expired',
  });
  reg.register('regen', { id: 'regen', onTick: { resourceId: 'hp', amount: 1, cause: 'regen' } });
  reg.register('haste', { id: 'haste', modifiers: [{ stat: 'speed', phase: 'add', amount: hasteSpeed }] });
}

/**
 * Apply (or refresh) a status on an entity in place — the shared status-push
 * used by both the `applyStatus` effect and threshold-triggered statuses (§9.2).
 * Refreshing takes the longer remaining duration and adds the extra stacks.
 */
export function pushActiveStatus(e: Entity, effectId: string, duration: number, stacks = 1): void {
  const comp = get<StatusesComponent>(e, 'statuses');
  const active = comp ? comp.active : [];
  const existing = active.find((a) => a.effectId === effectId);
  if (existing) {
    existing.duration = Math.max(existing.duration, duration);
    existing.stacks = (existing.stacks ?? 1) + (stacks - 1);
  } else {
    active.push({ effectId, duration, stacks });
  }
  if (!comp) set(e, { type: 'statuses', active });
}

/** An effect that applies (or refreshes) a status on an entity. */
export function applyStatusEffect(
  entityId: string,
  effectId: string,
  duration: number,
  stacks = 1,
): Effect {
  return {
    kind: `status:${effectId}`,
    validate: (world) => world.state.entities.has(entityId),
    apply(world) {
      pushActiveStatus(world.state.entities.get(entityId)!, effectId, duration, stacks);
      return [{ type: 'status:applied', entity: entityId, effectId }];
    },
  };
}

/** Find the resource whose `max` stat is `statName`, if any (for re-clamp pokes). */
function resourceCappedBy(world: World, statName: string): string | undefined {
  const reg = resourceRegistryOf(world);
  for (const id of reg.ids()) {
    if (reg.get(id).max === statName) return id;
  }
  return undefined;
}

/**
 * Advance one of `entityId`'s turns, in order: built-in resource regen → active
 * statuses (per-tick deltas, duration decay, expiry — emitting `onExpire` and a
 * `max-reduced` re-clamp poke for expiring max-affecting modifiers) → each of the
 * entity's mixins' `onActorTick` (§9.4). Mutates; returns the events (driven through
 * `runReactions` by the driver, so a `died` hook unschedules via the death reactor).
 */
export function tickActor(world: World, entityId: string): GameEvent[] {
  const e: Entity | undefined = world.state.entities.get(entityId);
  if (!e) return [];
  const events: GameEvent[] = [];

  // 1. Per-turn resource regen (§9.2): any resource def carrying a `regen` delta,
  //    for each pool the entity holds. Independent of statuses.
  const resComp = get<{ type: 'resources'; pools: Record<string, { current: number }> }>(e, 'resources');
  if (resComp) {
    const resReg = resourceRegistryOf(world);
    for (const resourceId of Object.keys(resComp.pools)) {
      const regen = resReg.tryGet(resourceId)?.regen;
      if (regen) events.push(...changeResource(world, entityId, resourceId, regen, 'regen'));
    }
  }

  // 2. Statuses: per-tick deltas, duration decay, and expiry.
  const comp = get<StatusesComponent>(e, 'statuses');
  if (comp && comp.active.length > 0) {
    const reg = statusRegistryOf(world);
    const survivors: ActiveStatus[] = [];

    for (const a of comp.active) {
      const def = reg.tryGet(a.effectId);
      const stacks = a.stacks ?? 1;
      if (def?.onTick) {
        events.push(
          ...changeResource(world, entityId, def.onTick.resourceId, def.onTick.amount * stacks, def.onTick.cause),
        );
      }
      const duration = a.duration - 1;
      if (duration > 0) {
        survivors.push({ ...a, duration });
      } else {
        if (def?.onExpire) events.push({ type: def.onExpire, entity: entityId });
        // Re-clamp any resource whose max this status was buffing (§9.2).
        for (const m of def?.modifiers ?? []) {
          const resId = resourceCappedBy(world, m.stat);
          if (resId) events.push(...changeResource(world, entityId, resId, 0, 'max-reduced'));
        }
      }
    }
    comp.active = survivors;
  }

  // 3. Mixin per-actor-tick hooks (§9.4), in the entity's declared mixin order —
  //    runs for every actor turn, including those with no statuses. Iterate the
  //    name list directly (no intermediate array) since this is the per-turn path.
  if (e.mixins.length > 0) {
    const mixinReg = mixinRegistryOf(world);
    for (const name of e.mixins) {
      const hook = mixinReg.tryGet(name)?.onActorTick;
      if (hook) events.push(...hook(e, world));
    }
  }

  return events;
}
