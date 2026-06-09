/**
 * component — schema-first component data (§5.1, §16.4).
 *
 * Components are plain serializable data tagged by `type`. Each is defined as a
 * Zod schema with the static type `z.infer`'d from it — one declaration, no
 * type written twice. The component registry stores `{ type, schema }` so the
 * load boundary can validate untrusted blobs (saves, authored blueprints).
 */
import { z } from 'zod';
import { createRegistry, type Registry } from './registry';
import type { ReadonlyWorld } from './world';

/** Runtime shape shared by every component: a `type` tag plus its data. */
export interface Component {
  type: string;
  [key: string]: unknown;
}

/** A registered component definition: its tag and validating schema. */
export interface ComponentDef<C extends Component = Component> {
  type: string;
  schema: z.ZodType<C>;
}

export type ComponentRegistry = Registry<ComponentDef>;

export function createComponentRegistry(): ComponentRegistry {
  return createRegistry<ComponentDef>('component');
}

/** Typed view of the component registry (centralizes the one downcast). */
export function componentRegistryOf(world: ReadonlyWorld): ComponentRegistry {
  return world.services.registries.components as ComponentRegistry;
}

/**
 * Validate an untrusted value as the component registered under `type`.
 * Throws (via Zod) when the value does not match the schema. Returns the
 * parsed, typed component.
 */
export function parseComponent(reg: ComponentRegistry, value: unknown): Component {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    throw new Error('parseComponent: value is not a component (missing type)');
  }
  const type = (value as { type: unknown }).type;
  if (typeof type !== 'string') {
    throw new Error('parseComponent: component type must be a string');
  }
  return reg.get(type).schema.parse(value);
}

// --- Example core component schemas (§5.1) -------------------------------
// These exercise the schema-first pattern and seed the default registry.

export const Position = z.object({
  type: z.literal('position'),
  x: z.number().int(),
  y: z.number().int(),
  levelId: z.string(),
});
export type Position = z.infer<typeof Position>;

export const Renderable = z.object({
  type: z.literal('renderable'),
  glyph: z.string(),
  fg: z.string(),
  bg: z.string().optional(),
  layer: z.number().int(),
});
export type Renderable = z.infer<typeof Renderable>;

/** Human-facing display metadata: a name and optional flavor/description text. */
export const Info = z.object({
  type: z.literal('info'),
  name: z.string(),
  description: z.string().optional(),
});
export type Info = z.infer<typeof Info>;

export const Stats = z.object({
  type: z.literal('stats'),
  base: z.record(z.string(), z.number()),
});
export type Stats = z.infer<typeof Stats>;

export const Resources = z.object({
  type: z.literal('resources'),
  pools: z.record(z.string(), z.object({ current: z.number() })),
});
export type Resources = z.infer<typeof Resources>;

export const Statuses = z.object({
  type: z.literal('statuses'),
  active: z.array(
    z.object({
      effectId: z.string(),
      duration: z.number(),
      stacks: z.number().int().optional(),
    }),
  ),
});
export type Statuses = z.infer<typeof Statuses>;

// --- Items, inventory, equipment (§10) -----------------------------------
// Items are entities with item-flavored components, so a sword on the floor and
// a sword in a pack are the same object. `stackable`/`qty` exist now; stacking
// logic is deferred (see roadmap follow-ups).

export const Item = z.object({
  type: z.literal('item'),
  name: z.string(),
  stackable: z.boolean(),
  qty: z.number().int(),
  weight: z.number().optional(),
});
export type Item = z.infer<typeof Item>;

export const Equipment = z.object({
  type: z.literal('equipment'),
  slot: z.string(),
  bonuses: z.record(z.string(), z.number()), // Partial<StatBlock>, additive
  /** Sticky once worn until uncursed (used by the identification module). */
  cursed: z.boolean().optional(),
});
export type Equipment = z.infer<typeof Equipment>;

export const Consumable = z.object({
  type: z.literal('consumable'),
  uses: z.number().int(),
  effect: z.string(), // consumable-effect id (magnitude encoded in the id)
});
export type Consumable = z.infer<typeof Consumable>;

/** Carrier component: the item entity ids being held. */
export const Inventory = z.object({
  type: z.literal('inventory'),
  items: z.array(z.string()),
  capacity: z.number().int().optional(),
});
export type Inventory = z.infer<typeof Inventory>;

/** Carrier component: which item is worn in each named slot. */
export const Equipped = z.object({
  type: z.literal('equipped'),
  slots: z.record(z.string(), z.string()), // slot → itemId
});
export type Equipped = z.infer<typeof Equipped>;

// --- Stairs / level links (§8.2) ------------------------------------------
// A stairs entity links two levels. `to` is the destination (the other end's
// level + cell); when absent, the engine's descend/ascend handler asks the
// world's `levelProvider` to build and link the destination on first use.

export const Stairs = z.object({
  type: z.literal('stairs'),
  dir: z.enum(['up', 'down']),
  to: z.object({ levelId: z.string(), cell: z.number().int() }).optional(),
});
export type Stairs = z.infer<typeof Stairs>;

// --- Factions (§11A.2) ----------------------------------------------------

export const Stance = z.enum(['hostile', 'neutral', 'allied']);
export type Stance = z.infer<typeof Stance>;

export const Allegiance = z.object({
  type: z.literal('allegiance'),
  faction: z.string(),
  /** Per-entity stance overrides (charm/fear/grudge) — directional, beat the matrix. */
  overrides: z.record(z.string(), Stance).optional(),
});
export type Allegiance = z.infer<typeof Allegiance>;

// --- Desire AI (§11.3.5) --------------------------------------------------

/** Weighted desires over fields; weights are data and may change at runtime. */
export const DesireAIData = z.object({
  type: z.literal('desire-ai'),
  desires: z.array(z.object({ fieldId: z.string(), weight: z.number() })),
});
export type DesireAIData = z.infer<typeof DesireAIData>;

// --- Tile flags (§8.1) ----------------------------------------------------

/** An entity contributes these flag bits at its cell (e.g. a sealing object → `airtight`). */
export const TileFlags = z.object({
  type: z.literal('tileFlags'),
  flags: z.array(z.string()),
});
export type TileFlags = z.infer<typeof TileFlags>;

/** Register the built-in component schemas into a registry. */
export function registerCoreComponents(reg: ComponentRegistry): void {
  reg.register('position', { type: 'position', schema: Position });
  reg.register('renderable', { type: 'renderable', schema: Renderable });
  reg.register('info', { type: 'info', schema: Info });
  reg.register('stats', { type: 'stats', schema: Stats });
  reg.register('resources', { type: 'resources', schema: Resources });
  reg.register('statuses', { type: 'statuses', schema: Statuses });
  reg.register('item', { type: 'item', schema: Item });
  reg.register('equipment', { type: 'equipment', schema: Equipment });
  reg.register('consumable', { type: 'consumable', schema: Consumable });
  reg.register('inventory', { type: 'inventory', schema: Inventory });
  reg.register('equipped', { type: 'equipped', schema: Equipped });
  reg.register('allegiance', { type: 'allegiance', schema: Allegiance });
  reg.register('desire-ai', { type: 'desire-ai', schema: DesireAIData });
  reg.register('tileFlags', { type: 'tileFlags', schema: TileFlags });
  reg.register('stairs', { type: 'stairs', schema: Stairs });
}

// --- Blueprints (content as data, §5.4) ----------------------------------
// A spawnable template: components + behavior mixins + tags. Authored content,
// so it is schema-first (validated when loaded from untrusted sources). `spawn`
// deep-clones the components and copies the mixin/tag names by reference.

/** Loose component shape for boundary validation: a `type` tag plus any data. */
export const ComponentData = z.object({ type: z.string() }).loose();

export const Blueprint = z.object({
  id: z.string(),
  components: z.array(ComponentData),
  mixins: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});
export type Blueprint = z.infer<typeof Blueprint>;
