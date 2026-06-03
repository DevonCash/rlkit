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

/** Register the built-in component schemas into a registry. */
export function registerCoreComponents(reg: ComponentRegistry): void {
  reg.register('position', { type: 'position', schema: Position });
  reg.register('renderable', { type: 'renderable', schema: Renderable });
}
