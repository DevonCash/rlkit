/**
 * hungerModule — a food clock (opt-in §6.4).
 *
 * Adds a `satiation` resource that drains a little each turn (a negative per-turn
 * `regen`, ticked by the engine's existing resource clock). Once it bottoms out,
 * every further drain underflows — a global reactor on `resource:underflow`
 * turns that into hp damage, so starvation is continuous (not an edge-triggered
 * status). Food consumables restore satiation. Leans almost entirely on the
 * resource system; the module is just the wiring + content hooks.
 */
import type { Reactor, EventReactionCtx } from '../core/reactor';
import type { Module } from '../core/module';
import { changeResourceEffect, resourceRegistryOf } from '../sim/resources';
import { statRegistryOf } from '../sim/stats';
import { consumableEffectRegistryOf } from '../sim/items';

export interface HungerOptions {
  /** Satiation lost per turn (default 1). */
  drainPerTurn?: number;
  /** HP lost per turn while starving (default 1). */
  starveDamage?: number;
  /** Max satiation (the `max-satiation` stat default, default 100). */
  maxSatiation?: number;
  /** Food: consumable-effect id → satiation restored. */
  foods?: { effect: string; amount: number }[];
}

export function hungerModule(opts: HungerOptions = {}): Module {
  const drainPerTurn = opts.drainPerTurn ?? 1;
  const starveDamage = opts.starveDamage ?? 1;
  const maxSatiation = opts.maxSatiation ?? 100;
  const foods = opts.foods ?? [];

  // Once satiation hits 0, the next drain underflows → starve for hp.
  const onUnderflow: Reactor = {
    on: 'resource:underflow',
    scope: 'global',
    phase: 'post',
    react(ctx) {
      const ev = (ctx as EventReactionCtx).event as { entity?: string; resourceId?: string };
      if (ev.resourceId !== 'satiation' || typeof ev.entity !== 'string') return;
      return [{ type: 'damage', actor: ev.entity, target: ev.entity, amount: starveDamage, cause: 'starve' }];
    },
  };

  return {
    id: 'hunger',
    setup(world) {
      const stats = statRegistryOf(world);
      if (!stats.has('max-satiation')) stats.register('max-satiation', { id: 'max-satiation', default: maxSatiation });

      const resources = resourceRegistryOf(world);
      if (!resources.has('satiation')) {
        resources.register('satiation', { id: 'satiation', max: 'max-satiation', regen: -drainPerTurn });
      }

      const ce = consumableEffectRegistryOf(world);
      for (const food of foods) {
        ce.register(food.effect, (innerCtx) =>
          innerCtx.push(changeResourceEffect(innerCtx.action.actor, 'satiation', food.amount, 'eat')),
        );
      }

      world.services.reactors.register(onUnderflow);
    },
  };
}
