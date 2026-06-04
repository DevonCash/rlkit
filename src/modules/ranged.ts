/**
 * rangedModule — ranged / thrown attacks (opt-in §6.4).
 *
 * Adds a `ranged` action — `{ actor, target: Cell }` — that checks range (a
 * `range` stat) and line of sight (`hasLoS`), then damages the creature on the
 * target cell using a `ranged-attack` stat through the shared damage formula.
 * It tags the victim with its attacker (so `progressionModule` credits ranged
 * kills) and ships an `aiRanged` mixin: shoot when the target is in range with
 * LoS (and not adjacent), otherwise close the distance.
 */
import { get, set } from '../core/entity';
import type { Position } from '../core/component';
import type { Effect, ActionHandler, ActionContext } from '../core/action';
import type { Mixin } from '../core/mixin';
import type { Registry } from '../core/registry';
import type { Module } from '../core/module';
import { cellOf, pointOf } from '../core/coords';
import { hasLoS } from '../core/geometry';
import { deriveStats, deriveStat, type StatDef } from '../sim/stats';
import { changeResourceEffect } from '../sim/resources';
import { defaultDamageFormula } from '../sim/combat';
import { nearestHostile, pathToward } from '../sim/ai/helpers';

const cheby = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/** Tag the victim with its attacker + announce a ranged hit (carries `by`). */
function announceRanged(targetId: string, by: string, amount: number): Effect {
  return {
    kind: 'damaged',
    validate: () => true,
    apply(world) {
      const t = world.state.entities.get(targetId);
      if (t) set(t, { type: 'damaged-by', id: by });
      return [{ type: 'damaged', entity: targetId, amount, by, ranged: true }];
    },
  };
}

export interface RangedOptions {
  /** Default `range` stat value (default 5). */
  defaultRange?: number;
}

export const aiRangedMixin: Mixin = {
  name: 'aiRanged',
  requires: ['position', 'allegiance'],
  takeTurn(self, world) {
    const sp = get<Position>(self, 'position');
    const target = nearestHostile(world, self);
    const tp = target && get<Position>(target, 'position');
    if (!sp || !target || !tp) return undefined;
    const level = world.state.levels.get(sp.levelId);
    if (!level) return undefined;
    const dist = cheby(sp.x, sp.y, tp.x, tp.y);
    const range = deriveStat(self, world, 'range');
    if (dist > 1 && dist <= range && hasLoS(level, { x: sp.x, y: sp.y }, { x: tp.x, y: tp.y }, world.services.tiles)) {
      return { type: 'ranged', actor: self.id, target: cellOf({ x: tp.x, y: tp.y }, level.width) };
    }
    const step = pathToward(world, level, { x: sp.x, y: sp.y }, { x: tp.x, y: tp.y });
    return step && (step.x !== 0 || step.y !== 0) ? { type: 'move', actor: self.id, dir: step } : undefined;
  },
};

export function rangedModule(opts: RangedOptions = {}): Module {
  const defaultRange = opts.defaultRange ?? 5;

  const ranged: ActionHandler = (ctx: ActionContext) => {
    const action = ctx.action;
    if (action.type !== 'ranged') return;
    const target = (action as { target?: number }).target;
    if (typeof target !== 'number') return void ctx.reject('ranged: no target');

    const attacker = ctx.world.state.entities.get(action.actor);
    const pos = attacker && get<Position>(attacker, 'position');
    if (!attacker || !pos) return void ctx.reject('ranged: no position');
    const level = ctx.world.state.levels.get(pos.levelId);
    if (!level) return void ctx.reject('ranged: no level');

    const { x: tx, y: ty } = pointOf(target, level.width);
    const atk = deriveStats(attacker, ctx.world);
    if (cheby(pos.x, pos.y, tx, ty) > (atk.range ?? defaultRange)) return void ctx.reject('ranged: out of range');
    if (!hasLoS(level, { x: pos.x, y: pos.y }, { x: tx, y: ty }, ctx.world.services.tiles)) {
      return void ctx.reject('ranged: no line of sight');
    }

    let victimId: string | undefined;
    for (const id of ctx.world.services.queries.at(target, pos.levelId)) {
      if (id === action.actor) continue;
      const e = ctx.world.state.entities.get(id);
      if (e && get(e, 'resources')) {
        victimId = id;
        break;
      }
    }
    if (!victimId) return void ctx.fizzle('ranged: hit nothing'); // a spent shot into empty space

    const def = deriveStats(ctx.world.state.entities.get(victimId)!, ctx.world);
    const atkBlock = { ...atk, attack: atk['ranged-attack'] ?? atk.attack ?? 0 };
    const amount = defaultDamageFormula(ctx.world.services.config.combat)(atkBlock, def, ctx.world.services.rng).amount;
    ctx.push(changeResourceEffect(victimId, 'hp', -amount, 'ranged'));
    ctx.push(announceRanged(victimId, action.actor, amount));
  };

  return {
    id: 'ranged',
    setup(world) {
      const stats = world.services.registries.stats as Registry<StatDef>;
      if (!stats.has('range')) stats.register('range', { id: 'range', default: defaultRange });
      if (!stats.has('ranged-attack')) stats.register('ranged-attack', { id: 'ranged-attack', default: 0 });
      (world.services.registries.handlers as Registry<ActionHandler>).register('ranged', ranged);
      (world.services.registries.mixins as Registry<Mixin>).register('aiRanged', aiRangedMixin);
    },
  };
}
