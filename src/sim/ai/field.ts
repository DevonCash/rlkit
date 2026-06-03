/**
 * field — the data-oriented FieldStore (§11.3.4).
 *
 * One store per Level. Field data lives as Float32 layers in `level.layers`
 * (keyed `field:<id>`), sharing the Cell space (§8.1). The store is a SERVICE —
 * it holds descriptors, dirty flags, version counters, the composite cache, a
 * reusable scratch buffer, and bus subscriptions; none of that is serialized.
 *
 * Field-major arrays (updates sweep one field across all cells); the query
 * pattern (sum many fields at one cell) is beaten by composite precomputation
 * cached by desire profile + invalidated via per-field version counters.
 * Composition clamps each field to a finite `maxDistance` before weighting so a
 * negative weight can't flip `+Infinity` to `-Infinity` and poison the sum.
 */
import type {
  FieldStore,
  FieldManager,
  FieldDescriptor,
  FieldCtx,
  FieldKind,
  FieldProducer,
  FieldId,
  DesireProfile,
} from '../../core/fields';
import { get } from '../../core/entity';
import type { Allegiance, Stance } from '../../core/component';
import type { Position } from '../../core/component';
import type { Cell } from '../../core/coords';
import { cellOf, neighbors4, neighbors8 } from '../../core/coords';
import { isWalkable, isTransparent, type Level } from '../../core/level';
import { EXPLORED_LAYER } from '../visibility';
import type { World } from '../../core/world';
import { goalProducer } from './producers/goal';

/** Goal/source cells for a field, resolved against the world (serialize-by-name). */
export type GoalSource =
  | { kind: 'stance'; stance: Stance; faction: string }
  | { kind: 'unexplored' }
  | { kind: 'cells'; cells: Cell[] };

export const FIELD_LAYER_PREFIX = 'field:';

const PRODUCERS: Partial<Record<FieldKind, FieldProducer>> = {
  goal: goalProducer as FieldProducer,
};

/** Register a producer for a field kind (scent/influence wired in group 6). */
export function registerFieldProducer(kind: FieldKind, producer: FieldProducer): void {
  PRODUCERS[kind] = producer;
}

function ensureF32(level: Level, name: string, n: number): Float32Array {
  let layer = level.layers.get(name);
  if (!(layer instanceof Float32Array) || layer.length !== n) {
    layer = new Float32Array(n);
    level.layers.set(name, layer);
  }
  return layer;
}

function resolveSource(source: GoalSource | undefined, world: World, level: Level): Cell[] {
  if (!source) return [];
  switch (source.kind) {
    case 'cells':
      return source.cells;
    case 'unexplored': {
      const explored = level.layers.get(EXPLORED_LAYER);
      const out: Cell[] = [];
      for (let c = 0; c < level.width * level.height; c++) {
        if (!(explored instanceof Uint8Array) || explored[c] !== 1) out.push(c);
      }
      return out;
    }
    case 'stance': {
      const matrix = world.services.config.factions.matrix;
      const want = matrix[source.faction] ?? {};
      const out: Cell[] = [];
      for (const e of world.services.queries.with('position', 'allegiance')) {
        const pos = get<Position>(e, 'position');
        const al = get<Allegiance>(e, 'allegiance');
        if (!pos || !al || pos.levelId !== level.id) continue;
        if (want[al.faction] === source.stance) out.push(cellOf({ x: pos.x, y: pos.y }, level.width));
      }
      return out;
    }
  }
}

function createFieldStore(world: World, level: Level): FieldStore {
  const n = level.width * level.height;
  const palette = world.services.tiles;
  const descs = new Map<FieldId, FieldDescriptor>();
  const versions = new Map<FieldId, number>();
  const dirty = new Set<FieldId>();
  const composites = new Map<string, { versions: string; data: Float32Array }>();
  const unsubs: Array<() => void> = [];
  let scratch: Float32Array | undefined;

  const layerOf = (id: FieldId): Float32Array => ensureF32(level, FIELD_LAYER_PREFIX + id, n);
  const bump = (id: FieldId): void => {
    versions.set(id, (versions.get(id) ?? 0) + 1);
  };

  function makeCtx(desc: FieldDescriptor): FieldCtx {
    const params = desc.params as { source?: GoalSource; passUnexplored?: boolean };
    // Autoexplore treats undiscovered cells as floor so the frontier is reachable.
    const explored = params.passUnexplored ? level.layers.get(EXPLORED_LAYER) : undefined;
    const passable = (c: Cell): boolean =>
      isWalkable(level, c, palette) || (explored instanceof Uint8Array && explored[c] !== 1);
    return {
      width: level.width,
      height: level.height,
      diagonals: desc.diagonals ?? false,
      passable,
      transparent: (c) => isTransparent(level, c, palette),
      goalCells: () => resolveSource(params.source, world, level),
      scratch: () => (scratch ??= new Float32Array(n)),
      rng: world.services.rng,
    };
  }

  function recompute(id: FieldId): void {
    const desc = descs.get(id)!;
    const producer = PRODUCERS[desc.kind];
    if (!producer) throw new Error(`FieldStore: no producer for kind "${desc.kind}"`);
    producer.recompute(layerOf(id), makeCtx(desc), desc.params);
    dirty.delete(id);
    bump(id);
  }

  return {
    ensure(desc) {
      if (descs.has(desc.id)) return;
      descs.set(desc.id, desc);
      versions.set(desc.id, 0);
      ensureF32(level, FIELD_LAYER_PREFIX + desc.id, n);
      dirty.add(desc.id);
      for (const ev of desc.invalidateOn ?? []) {
        unsubs.push(world.services.bus.on(ev, () => dirty.add(desc.id)));
      }
    },
    data(id) {
      if (dirty.has(id)) recompute(id);
      return layerOf(id);
    },
    composite(profile: DesireProfile) {
      // Make every contributing field current, then key the cache by versions.
      for (const d of profile) if (dirty.has(d.fieldId)) recompute(d.fieldId);
      const key = profile.map((d) => `${d.fieldId}=${d.weight}`).join(';');
      const verKey = profile.map((d) => versions.get(d.fieldId) ?? -1).join(',');
      const cached = composites.get(key);
      if (cached && cached.versions === verKey) return cached.data;

      const out = cached?.data ?? new Float32Array(n);
      const maxD = world.services.config.fields.maxDistance;
      out.fill(0);
      for (const d of profile) {
        const f = layerOf(d.fieldId);
        for (let i = 0; i < n; i++) out[i]! += Math.min(f[i]!, maxD) * d.weight;
      }
      composites.set(key, { versions: verKey, data: out });
      return out;
    },
    bestStep(field, cell, diagonals) {
      const nbs = diagonals
        ? neighbors8(cell, level.width, level.height)
        : neighbors4(cell, level.width, level.height);
      let best = -1;
      let bestV = field[cell]!;
      for (const nb of nbs) {
        if (!isWalkable(level, nb, palette)) continue;
        if (field[nb]! < bestV) {
          bestV = field[nb]!;
          best = nb;
        }
      }
      return best;
    },
    markDirty(id) {
      dirty.add(id);
    },
    tick() {
      for (const [id, desc] of descs) {
        if (!desc.perTurn) continue;
        const producer = PRODUCERS[desc.kind];
        if (producer?.step) {
          producer.step(layerOf(id), makeCtx(desc), desc.params);
          bump(id);
        } else {
          recompute(id);
        }
      }
    },
    dispose() {
      for (const u of unsubs) u();
      unsubs.length = 0;
    },
  };
}

/** Create the per-world field manager (one store per level, lazily). */
export function createFieldManager(world: World): FieldManager {
  const stores = new Map<string, FieldStore>();
  return {
    forLevel(levelId) {
      let store = stores.get(levelId);
      if (!store) {
        const level = world.state.levels.get(levelId);
        if (!level) throw new Error(`FieldManager: unknown level "${levelId}"`);
        store = createFieldStore(world, level);
        stores.set(levelId, store);
      }
      return store;
    },
  };
}
