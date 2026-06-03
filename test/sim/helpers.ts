import { createWorld } from '../../src/index';
import type { World } from '../../src/core/world';
import { createLevel, type Level } from '../../src/core/level';
import { createEntity, set } from '../../src/core/entity';
import type { Entity, EntityId } from '../../src/core/entity';
import { cellOf } from '../../src/core/coords';
import { defaultConfig } from '../../src/config/defaults';
import type { ActionHandler } from '../../src/core/action';
import type { Registry } from '../../src/core/registry';

/** A real level filled with floor (index 1, registered by the default config). */
export function makeLevel(id: string, width: number, height: number): Level {
  return createLevel(id, width, height, 1);
}

export function makeWorld(seed = 1): World {
  return createWorld({ config: defaultConfig, rng: seed });
}

/** Spawn an entity with a position, indexed and placed in the spatial index. */
export function spawnAt(
  world: World,
  id: EntityId,
  levelId: string,
  x: number,
  y: number,
  mixins: string[] = [],
): Entity {
  const e = createEntity(id, [{ type: 'position', x, y, levelId }], mixins);
  world.state.entities.set(id, e);
  world.services.queries.index(e);
  const level = world.state.levels.get(levelId)!;
  world.services.queries.place(id, levelId, cellOf({ x, y }, level.width));
  return e;
}

export function handlers(world: World): Registry<ActionHandler> {
  return world.services.registries.handlers as Registry<ActionHandler>;
}

export { set, cellOf };
