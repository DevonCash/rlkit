/**
 * identificationModule — unidentified items & curses (opt-in §6.4).
 *
 * The Berlin "discovery" factor. An item with an `identity` component shows its
 * `appearance` ("a fizzy potion") until identified; using a consumable or
 * equipping an item reveals it. Equipment may be `cursed` — sticky once worn
 * until a Remove Curse, enforced by a pre-reactor that rejects `unequip`.
 *
 * Games route their item UI through {@link displayName} so unidentified items
 * read as their appearance everywhere (look, log, inventory).
 */
import { z } from 'zod';
import { get } from '../core/entity';
import type { Info, Item, Inventory, Equipped, Equipment } from '../core/component';
import type { ComponentRegistry } from '../core/component';
import type { Effect, ActionContext } from '../core/action';
import type { Reactor } from '../core/reactor';
import type { ReadonlyWorld } from '../core/world';
import type { Module } from '../core/module';
import type { ConsumableEffectRegistry } from '../sim/items';

export const Identity = z.object({
  type: z.literal('identity'),
  identified: z.boolean(),
  appearance: z.string().optional(),
});
export type Identity = z.infer<typeof Identity>;

/** Player-facing name: the appearance while unidentified, else info/item name. */
export function displayName(world: ReadonlyWorld, id: string): string {
  const e = world.state.entities.get(id);
  if (!e) return id;
  const ident = get<Identity>(e, 'identity');
  if (ident && !ident.identified && ident.appearance) return ident.appearance;
  return get<Info>(e, 'info')?.name ?? get<Item>(e, 'item')?.name ?? id;
}

function identifyEffect(itemId: string): Effect {
  return {
    kind: 'identify',
    validate: (w) => w.state.entities.has(itemId),
    apply(world) {
      const item = world.state.entities.get(itemId);
      const ident = item && get<Identity>(item, 'identity');
      if (ident && !ident.identified) {
        ident.identified = true;
        return [{ type: 'item:identified', item: itemId }];
      }
      return [];
    },
  };
}

function removeCurseEffect(actorId: string): Effect {
  return {
    kind: 'remove-curse',
    validate: (w) => w.state.entities.has(actorId),
    apply(world) {
      const actor = world.state.entities.get(actorId)!;
      const equipped = get<Equipped>(actor, 'equipped');
      let cleared = 0;
      for (const itemId of Object.values(equipped?.slots ?? {})) {
        const eq = get<Equipment>(world.state.entities.get(itemId)!, 'equipment');
        if (eq?.cursed) {
          eq.cursed = false;
          cleared++;
        }
      }
      return cleared ? [{ type: 'curse:removed', entity: actorId, count: cleared }] : [];
    },
  };
}

export function identificationModule(): Module {
  // Identify the item being equipped (you learn it by wearing it).
  const onEquip: Reactor = {
    on: 'equip',
    scope: 'global',
    phase: 'pre',
    react(ctx) {
      const c = ctx as ActionContext;
      const itemId = (c.action as { item?: string }).item;
      if (typeof itemId === 'string') c.push(identifyEffect(itemId));
    },
  };

  // A worn cursed item cannot be removed.
  const onUnequip: Reactor = {
    on: 'unequip',
    scope: 'global',
    phase: 'pre',
    react(ctx) {
      const c = ctx as ActionContext;
      const slot = (c.action as { slot?: string }).slot;
      const actor = c.world.state.entities.get(c.action.actor);
      const equipped = actor && get<Equipped>(actor, 'equipped');
      const itemId = slot ? equipped?.slots[slot] : undefined;
      const item = itemId ? c.world.state.entities.get(itemId) : undefined;
      const eq = item && get<Equipment>(item, 'equipment');
      if (eq?.cursed) c.reject('it is cursed!');
    },
  };

  return {
    id: 'identification',
    setup(world) {
      const components = world.services.registries.components as ComponentRegistry;
      if (!components.has('identity')) components.register('identity', { type: 'identity', schema: Identity });

      const ce = world.services.registries.consumableEffects as ConsumableEffectRegistry;
      // Identify the first unidentified item the user is carrying.
      ce.register('identify', (ctx) => {
        const actor = ctx.world.state.entities.get(ctx.action.actor);
        const inv = actor && get<Inventory>(actor, 'inventory');
        for (const itemId of inv?.items ?? []) {
          const item = ctx.world.state.entities.get(itemId);
          const ident = item && get<Identity>(item, 'identity');
          if (ident && !ident.identified) {
            ctx.push(identifyEffect(itemId));
            return;
          }
        }
      });
      ce.register('remove-curse', (ctx) => ctx.push(removeCurseEffect(ctx.action.actor)));

      world.services.reactors.register(onEquip);
      world.services.reactors.register(onUnequip);
    },
  };
}
