/**
 * items — inventory/equipment helpers, the equippable mixin, and the
 * consumable-effect registry (§10).
 *
 * Items are entities: "a sword on the floor" and "a sword in a pack" are the
 * same object. **Location invariant:** a carried item has NO `position`
 * component and appears in exactly one `Inventory.items`; a floor item has a
 * `position` and is in the spatial index. The blessed "floor items" query is
 * `with('position', 'item')`.
 *
 * Equipment rides the existing stat pipeline: the `equippable` mixin's
 * `modifyStats` reads the carrier's worn items and emits their bonuses, so
 * `deriveStats` needs no special-casing (§9.1).
 */
import { get, type Entity } from '../core/entity';
import type { Component } from '../core/component';
import type { Mixin } from '../core/mixin';
import type { StatModifier } from '../core/stats';
import type { ActionContext } from '../core/action';
import type { Cell } from '../core/coords';
import type { ReadonlyWorld } from '../core/world';
import type { Config } from '../config/defaults';
import type { Registry } from '../core/registry';
import { changeResourceEffect } from './resources';

// --- component shapes (read views) ---------------------------------------
interface ItemComponent extends Component {
  type: 'item';
  name: string;
  stackable: boolean;
  qty: number;
  weight?: number;
}
interface EquipmentComponent extends Component {
  type: 'equipment';
  slot: string;
  bonuses: Record<string, number>;
}
interface InventoryComponent extends Component {
  type: 'inventory';
  items: string[];
  capacity?: number;
}
interface EquippedComponent extends Component {
  type: 'equipped';
  slots: Record<string, string>;
}

// --- inventory helpers ----------------------------------------------------

export function effectiveCapacity(inv: InventoryComponent, config: Config): number {
  return inv.capacity ?? config.inventory.defaultCapacity;
}

/** Total weight of an inventory's items (0 when items have no weight). */
export function inventoryWeight(inv: InventoryComponent, world: ReadonlyWorld): number {
  let total = 0;
  for (const id of inv.items) {
    const item = world.state.entities.get(id);
    const comp = item && get<ItemComponent>(item, 'item');
    total += comp?.weight ?? 0;
  }
  return total;
}

/** Whether `carrier` could pick up `item` without exceeding capacity or weight. */
export function canCarry(carrier: Entity, item: Entity, world: ReadonlyWorld, config: Config): boolean {
  const inv = get<InventoryComponent>(carrier, 'inventory');
  if (!inv) return false;
  if (inv.items.length >= effectiveCapacity(inv, config)) return false;
  const maxWeight = config.inventory.maxCarryWeight;
  if (maxWeight !== undefined) {
    const w = get<ItemComponent>(item, 'item')?.weight ?? 0;
    if (inventoryWeight(inv, world) + w > maxWeight) return false;
  }
  return true;
}

// --- the equippable mixin (stat fold) ------------------------------------

/**
 * Carrier mixin: contributes the stat bonuses of every worn item. Inert unless
 * the entity has an `equipped` component (`requires`), so it's safe on any actor.
 */
export const equippableMixin: Mixin = {
  name: 'equippable',
  requires: ['equipped'],
  modifyStats(self, world) {
    const equipped = get<EquippedComponent>(self, 'equipped');
    if (!equipped) return [];
    const mods: StatModifier[] = [];
    for (const itemId of Object.values(equipped.slots)) {
      const item = world.state.entities.get(itemId);
      const eq = item && get<EquipmentComponent>(item, 'equipment');
      if (!eq) continue;
      for (const [stat, amount] of Object.entries(eq.bonuses)) {
        mods.push({ stat, phase: 'add', amount });
      }
    }
    return mods;
  },
};

// --- consumable-effect registry ------------------------------------------

/** A consumable's effect: pushes effects onto the use action's context. */
export type ConsumableEffect = (ctx: ActionContext, item: Entity, target?: Cell) => void;
export type ConsumableEffectRegistry = Registry<ConsumableEffect>;

/** Register the batteries-included proof consumable effects (overridable content). */
export function registerCoreConsumableEffects(reg: ConsumableEffectRegistry): void {
  reg.register('heal-10', (ctx) => {
    ctx.push(changeResourceEffect(ctx.action.actor, 'hp', 10, 'restore'));
  });
}
