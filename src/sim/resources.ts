/**
 * resources — bounded pools and the single change chokepoint (§9.2).
 *
 * A resource's `max` is a stat (so a +max-hp ring flows through the stat
 * pipeline automatically). Every change goes through `changeResource`, which
 * clamps to `[0, max]` and emits events for anything lost (overflow/underflow)
 * or any threshold crossed — the one place resources become reactable. Mutation
 * happens here, so it is always invoked from inside an `Effect.apply`.
 */
import { get, type Entity } from '../core/entity';
import type { Component } from '../core/component';
import type { GameEvent } from '../core/events';
import type { World } from '../core/world';
import type { Effect } from '../core/action';
import type { Registry } from '../core/registry';
import { deriveStat } from './stats';

export interface Threshold {
  at?: number;
  below?: number;
  emit?: string;
  status?: string;
}

export interface ResourceDef {
  id: string;
  /** Stat name providing the cap, e.g. 'max-hp'. */
  max: string;
  /** Per-turn delta, ticked on the per-actor clock (§9.2). */
  regen?: number;
  thresholds?: Threshold[];
}
export type ResourceDefRegistry = Registry<ResourceDef>;

interface ResourcesComponent extends Component {
  type: 'resources';
  pools: Record<string, { current: number }>;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function crossedDown(t: Threshold, before: number, after: number): boolean {
  if (t.at !== undefined) return before > t.at && after <= t.at;
  if (t.below !== undefined) return before >= t.below && after < t.below;
  return false;
}

/**
 * Apply a delta to a pool: clamp to `[0, max]`, emit overflow/underflow for
 * anything lost, and fire edge-triggered thresholds. Returns the events; the
 * pool is mutated in place. No-op (returns []) if the entity lacks the pool.
 */
export function changeResource(
  world: World,
  entityId: string,
  resourceId: string,
  delta: number,
  cause: string,
): GameEvent[] {
  const e: Entity | undefined = world.state.entities.get(entityId);
  const comp = e && get<ResourcesComponent>(e, 'resources');
  const pool = comp?.pools[resourceId];
  if (!e || !pool) return [];

  const defReg = world.services.registries.resources as ResourceDefRegistry | undefined;
  const def = defReg?.tryGet(resourceId);
  const max = def ? deriveStat(e, world, def.max) : Number.POSITIVE_INFINITY;

  const before = pool.current;
  const raw = before + delta;
  const after = clamp(raw, 0, max);
  pool.current = after;

  const events: GameEvent[] = [];
  if (raw > max) {
    events.push({ type: 'resource:overflow', entity: entityId, resourceId, excess: raw - max, cause });
  }
  if (raw < 0) {
    events.push({ type: 'resource:underflow', entity: entityId, resourceId, deficit: -raw, cause });
  }
  for (const t of def?.thresholds ?? []) {
    if (crossedDown(t, before, after)) {
      if (t.emit) events.push({ type: t.emit, entity: entityId });
      // `status` application is wired by the status system (M4 group 5).
    }
  }
  return events;
}

export interface ChangeResourceOptions {
  /** Reject the action (via validate) if the pool can't cover a negative delta. */
  requireSufficient?: boolean;
}

/** An effect that applies a resource change atomically through the pipeline. */
export function changeResourceEffect(
  entityId: string,
  resourceId: string,
  delta: number,
  cause: string,
  opts: ChangeResourceOptions = {},
): Effect {
  return {
    kind: `resource:${resourceId}`,
    validate(world) {
      const e = world.state.entities.get(entityId);
      const comp = e && get<ResourcesComponent>(e, 'resources');
      const pool = comp?.pools[resourceId];
      if (!pool) return false;
      if (opts.requireSufficient && pool.current + delta < 0) return false;
      return true;
    },
    apply(world) {
      return changeResource(world, entityId, resourceId, delta, cause);
    },
  };
}
