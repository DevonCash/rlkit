/**
 * stats — derived-scalar computation (§9.1).
 *
 * A stat's value is `base + modifiers`, recomputed on demand (never stored
 * stale). Modifiers are gathered from every source — entity mixins'
 * `modifyStats`, active status effects (and equipment in M5) — then applied in
 * a fixed phase order: base → Σadd → Πmul → clamp. The phase order is logic;
 * the base values, modifier amounts, and clamp bounds are config/content.
 */
import { get, type Entity } from '../core/entity';
import { resolveMixins, type MixinRegistry } from '../core/mixin';
import type { Component } from '../core/component';
import type { StatBlock, StatModifier } from '../core/stats';
import type { ReadonlyWorld } from '../core/world';
import type { Registry } from '../core/registry';

/** A stat definition: its fallback base and optional clamp bounds (content). */
export interface StatDef {
  id: string;
  default?: number;
  min?: number;
  max?: number;
}
export type StatDefRegistry = Registry<StatDef>;

interface StatsComponent extends Component {
  type: 'stats';
  base: Record<string, number>;
}
interface ActiveStatus {
  effectId: string;
  duration: number;
  stacks?: number;
}
interface StatusComponent extends Component {
  type: 'statuses';
  active: ActiveStatus[];
}

function statRegistry(world: ReadonlyWorld): StatDefRegistry | undefined {
  return world.services.registries.stats as StatDefRegistry | undefined;
}

/** Gather every modifier contributed to `e`, in source order (mixins, statuses). */
function gatherModifiers(e: Entity, world: ReadonlyWorld): StatModifier[] {
  const out: StatModifier[] = [];
  const mixins = world.services.registries.mixins as unknown as MixinRegistry | undefined;
  if (mixins) {
    for (const m of resolveMixins(e, mixins)) {
      if (m.modifyStats) out.push(...m.modifyStats(e, world));
    }
  }
  const statuses = get<StatusComponent>(e, 'statuses');
  if (statuses) {
    const reg = world.services.registries.statuses;
    for (const a of statuses.active) {
      const def = reg?.tryGet(a.effectId) as { modifiers?: StatModifier[] } | undefined;
      if (def?.modifiers) {
        const stacks = a.stacks ?? 1;
        for (let s = 0; s < stacks; s++) out.push(...def.modifiers);
      }
    }
  }
  return out;
}

/** Resolve the full stat block for an entity. */
export function deriveStats(e: Entity, world: ReadonlyWorld): StatBlock {
  const statReg = statRegistry(world);
  const baseComp = get<StatsComponent>(e, 'stats');
  const mods = gatherModifiers(e, world);

  // The stat set: declared bases ∪ modified stats ∪ every registered StatDef.
  const ids = new Set<string>();
  if (baseComp) for (const k of Object.keys(baseComp.base)) ids.add(k);
  for (const m of mods) ids.add(m.stat);
  if (statReg) for (const id of statReg.ids()) ids.add(id);

  const block: StatBlock = {};
  for (const id of ids) {
    const def = statReg?.tryGet(id);
    let v = baseComp?.base[id] ?? def?.default ?? 0;
    for (const m of mods) if (m.stat === id && m.phase === 'add') v += m.amount;
    for (const m of mods) if (m.stat === id && m.phase === 'mul') v *= m.amount;
    if (def?.min !== undefined) v = Math.max(def.min, v);
    if (def?.max !== undefined) v = Math.min(def.max, v);
    block[id] = v;
  }
  return block;
}

/** Convenience: resolve a single stat (0 if undefined). */
export function deriveStat(e: Entity, world: ReadonlyWorld, id: string): number {
  return deriveStats(e, world)[id] ?? 0;
}
