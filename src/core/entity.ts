/**
 * entity — entities as data, with accessors that live outside the data (§5.2).
 *
 * An entity is an id, a component map keyed by `type`, and a list of mixin
 * *names* (behavior is serialized by name, never as functions — §6.3). There
 * are no methods on the entity itself; typed `get`/`has`/`set` are free
 * functions. A component whose data is itself a keyed map ("container
 * component") holds multiple inner instances by their own inner id.
 */
import type { Component } from './component';

export type EntityId = string;

export interface Entity {
  id: EntityId;
  components: Map<string, Component>;
  mixins: string[];
}

/** Create a bare entity with optional starting components and mixins. */
export function createEntity(
  id: EntityId,
  components: Component[] = [],
  mixins: string[] = [],
): Entity {
  const map = new Map<string, Component>();
  for (const c of components) map.set(c.type, c);
  return { id, components: map, mixins: [...mixins] };
}

/** Get a component by its `type` tag, narrowed to `C`. */
export function get<C extends Component>(e: Entity, type: C['type']): C | undefined {
  return e.components.get(type) as C | undefined;
}

/** Whether the entity carries a component of `type`. */
export function has(e: Entity, type: string): boolean {
  return e.components.has(type);
}

/** Set (add or replace) a component by its `type` tag. */
export function set(e: Entity, c: Component): void {
  e.components.set(c.type, c);
}

/** Remove a component by `type`; returns whether one was present. */
export function remove(e: Entity, type: string): boolean {
  return e.components.delete(type);
}
