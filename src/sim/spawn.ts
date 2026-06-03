/**
 * spawn — instantiate a blueprint onto a level (§5.4, §20.3).
 *
 * Reads a `Blueprint` from the registry, mints a deterministic entity id from
 * `WorldState.nextEntityId`, deep-clones its components, sets the entity's
 * `Position` to the spawn cell, and indexes + places it via `QueryIndex`.
 *
 * Placement-only in M3: it does NOT add the entity to the timeline. The
 * actor/blueprint convention (what marks an entity as a turn-taker and its
 * speed) is a deliberate M4 follow-up, once stats/speed exist.
 */
import type { Cell } from '../core/coords';
import { pointOf } from '../core/coords';
import { createEntity, set, type Entity } from '../core/entity';
import type { Component } from '../core/component';
import type { Blueprint } from '../core/component';
import type { World } from '../core/world';

/** Deep-clone plain (schema-first) component data — no functions/Maps inside. */
function deepClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(deepClone) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value)) {
      out[k] = deepClone((value as Record<string, unknown>)[k]);
    }
    return out as T;
  }
  return value;
}

export interface SpawnOptions {
  /** The cell to place the entity at (within `levelId`). */
  at: Cell;
  levelId: string;
}

export function spawn(world: World, blueprintId: string, opts: SpawnOptions): Entity {
  const blueprint = world.services.registries.blueprints?.tryGet(blueprintId) as
    | Blueprint
    | undefined;
  if (!blueprint) throw new Error(`spawn: unknown blueprint "${blueprintId}"`);

  const level = world.state.levels.get(opts.levelId);
  if (!level) throw new Error(`spawn: unknown level "${opts.levelId}"`);

  const id = `e${world.state.nextEntityId++}`;
  const components = deepClone(blueprint.components) as Component[];
  const entity = createEntity(id, components, blueprint.mixins ? [...blueprint.mixins] : []);

  // Place: set/override the position component to the spawn cell.
  const { x, y } = pointOf(opts.at, level.width);
  set(entity, { type: 'position', x, y, levelId: opts.levelId });

  if (blueprint.tags && blueprint.tags.length > 0) {
    set(entity, { type: 'tags', tags: [...blueprint.tags] });
  }

  world.state.entities.set(id, entity);
  world.services.queries.index(entity);
  world.services.queries.place(id, opts.levelId, opts.at);
  return entity;
}
