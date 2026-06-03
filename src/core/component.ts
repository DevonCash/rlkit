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

/** Register the built-in component schemas into a registry. */
export function registerCoreComponents(reg: ComponentRegistry): void {
  reg.register('position', { type: 'position', schema: Position });
  reg.register('renderable', { type: 'renderable', schema: Renderable });
  reg.register('stats', { type: 'stats', schema: Stats });
  reg.register('resources', { type: 'resources', schema: Resources });
  reg.register('statuses', { type: 'statuses', schema: Statuses });
  reg.register('item', { type: 'item', schema: Item });
  reg.register('equipment', { type: 'equipment', schema: Equipment });
  reg.register('consumable', { type: 'consumable', schema: Consumable });
  reg.register('inventory', { type: 'inventory', schema: Inventory });
  reg.register('equipped', { type: 'equipped', schema: Equipped });
}

// --- Blueprints (content as data, §5.4) ----------------------------------
// A spawnable template: components + behavior mixins + tags. Authored content,
// so it is schema-first (validated when loaded from untrusted sources). `spawn`
// deep-clones the components and copies the mixin/tag names by reference.

const ComponentData = z.object({ type: z.string() }).loose();

export const Blueprint = z.object({
  id: z.string(),
  components: z.array(ComponentData),
  mixins: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});
export type Blueprint = z.infer<typeof Blueprint>;
