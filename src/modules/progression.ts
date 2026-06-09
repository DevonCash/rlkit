/**
 * progressionModule — experience & levels (opt-in §6.4, depends on `combat`).
 *
 * Entities with an `experience` component earn XP when they land a kill (the
 * victim's `bounty` stat), credited via the attacker recorded by `combatModule`
 * (`lastAttackerOf`). Crossing the `curve` raises `level`, applies `gains` to the
 * entity's `stats.base`, refills resources, and emits `leveled-up`. The curve and
 * per-level gains are supplied by the game, so the *system* is the engine's and
 * the *balance* is content.
 */
import { z } from 'zod';
import { get, type Entity } from '../core/entity';
import { componentRegistryOf, type Component } from '../core/component';
import { handlerRegistryOf, type Effect, type ActionHandler, type ActionContext } from '../core/action';
import type { GameEvent } from '../core/events';
import type { Reactor, EventReactionCtx } from '../core/reactor';
import type { World } from '../core/world';
import type { Module } from '../core/module';
import { deriveStat, statRegistryOf } from '../sim/stats';
import { resourceRegistryOf } from '../sim/resources';
import { lastAttackerOf } from './combat';

export const Experience = z.object({ type: z.literal('experience'), xp: z.number(), level: z.number() });
export type Experience = z.infer<typeof Experience>;

interface StatsComponent extends Component {
  type: 'stats';
  base: Record<string, number>;
}
interface ResourcesComponent extends Component {
  type: 'resources';
  pools: Record<string, { current: number }>;
}

export interface ProgressionOptions {
  /** XP required to advance FROM `level` to `level+1`. */
  curve: (level: number) => number;
  /** Stat-base increments granted on reaching each new level. */
  gains: (level: number) => Record<string, number>;
  /** Resource ids refilled to max on level-up (default `['hp']`). */
  refill?: string[];
}

export function progressionModule(opts: ProgressionOptions): Module {
  const refill = opts.refill ?? ['hp'];

  /** Add XP to an entity and resolve any level-ups it triggers. */
  function awardXpEffect(actorId: string, amount: number): Effect {
    return {
      kind: 'award-xp',
      validate: (w) => {
        const e = w.state.entities.get(actorId);
        return !!e && !!get<Experience>(e, 'experience');
      },
      apply(world: World) {
        const e = world.state.entities.get(actorId) as Entity;
        const exp = get<Experience>(e, 'experience')!;
        exp.xp += amount;
        const events: GameEvent[] = [{ type: 'xp-gained', entity: actorId, amount }];
        while (exp.xp >= opts.curve(exp.level)) {
          exp.xp -= opts.curve(exp.level);
          exp.level += 1;
          const stats = get<StatsComponent>(e, 'stats');
          if (stats) {
            for (const [k, v] of Object.entries(opts.gains(exp.level))) {
              stats.base[k] = (stats.base[k] ?? 0) + v;
            }
          }
          const res = get<ResourcesComponent>(e, 'resources');
          const resReg = resourceRegistryOf(world);
          if (res) {
            for (const id of refill) {
              const pool = res.pools[id];
              const def = resReg?.tryGet(id);
              if (pool && def) pool.current = deriveStat(e, world, def.max);
            }
          }
          events.push({ type: 'leveled-up', entity: actorId, level: exp.level });
        }
        return events;
      },
    };
  }

  const awardXp: ActionHandler = (ctx: ActionContext) => {
    const amount = (ctx.action as { amount?: number }).amount ?? 0;
    ctx.push(awardXpEffect(ctx.action.actor, amount));
  };

  const onDied: Reactor = {
    on: 'died',
    scope: 'global',
    phase: 'post',
    react(ctx) {
      const { event, world } = ctx as EventReactionCtx;
      const victimId = (event as { entity?: string }).entity;
      if (typeof victimId !== 'string') return;
      const killerId = (event as { by?: string }).by ?? lastAttackerOf(world, victimId);
      if (!killerId) return;
      const killer = world.state.entities.get(killerId);
      if (!killer || !get<Experience>(killer, 'experience')) return;
      const victim = world.state.entities.get(victimId);
      const bounty = victim ? deriveStat(victim, world, 'bounty') : 0;
      if (bounty <= 0) return;
      return [{ type: 'award-xp', actor: killerId, amount: bounty }];
    },
  };

  return {
    id: 'progression',
    dependencies: ['combat'],
    setup(world) {
      const components = componentRegistryOf(world);
      if (!components.has('experience')) components.register('experience', { type: 'experience', schema: Experience });
      const stats = statRegistryOf(world);
      if (!stats.has('bounty')) stats.register('bounty', { id: 'bounty', default: 0 });
      handlerRegistryOf(world).register('award-xp', awardXp);
      world.services.reactors.register(onDied);
    },
  };
}
