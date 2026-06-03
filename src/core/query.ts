/**
 * query — the entity query/index layer (§6.1).
 *
 * Incrementally-maintained indexes so common lookups are not O(entities):
 *   - per-component-type id sets   → `with(...types)`
 *   - per-mixin-name id sets       → `withMixin(name)`
 *   - a tag index (§11A.1)         → `byTag(tag)`
 *   - a spatial index by cell      → `at(cell, levelId?)`
 *
 * Iteration order is insertion-stable (Set order) for determinism. The world
 * drives the maintenance hooks; consumers see the read-only `Queries` face.
 *
 * NOTE (M1): cells are level-local (`Cell = y*width+x`), but packing needs the
 * Level width, which arrives with `Level` in milestone 3. Until then the
 * spatial index is keyed by `(levelId, cell)` and `at()` takes an optional
 * `levelId`; the full `Level.entityIndex` integration lands in M3.
 */
import type { Cell } from './coords';
import type { Entity, EntityId } from './entity';
import { TagIndex } from './tags';

export interface Queries {
  /** Entities having ALL of the given component types. */
  with(...componentTypes: string[]): Iterable<Entity>;
  /** Entities carrying the named mixin. */
  withMixin(name: string): Iterable<Entity>;
  /** Entity ids at a cell. Pass `levelId` to disambiguate across levels. */
  at(cell: Cell, levelId?: string): Iterable<EntityId>;
  /** Entity ids carrying a tag (§11A.1). */
  byTag(tag: string): Iterable<EntityId>;
}

const EMPTY: ReadonlySet<EntityId> = new Set();

export class QueryIndex implements Queries {
  private byComponent = new Map<string, Set<EntityId>>();
  private byMixin = new Map<string, Set<EntityId>>();
  private tags = new TagIndex();
  private byCell = new Map<string, Set<EntityId>>();
  private position = new Map<EntityId, string>(); // id -> spatial key

  /** Backed by the world's entity map so queries return live entities. */
  constructor(private entities: Map<EntityId, Entity>) {}

  // --- maintenance hooks (driven by the world) ---------------------------

  /** Index a newly-added entity across all of its components/mixins/tags. */
  index(e: Entity): void {
    for (const type of e.components.keys()) this.addToSet(this.byComponent, type, e.id);
    for (const name of e.mixins) this.addToSet(this.byMixin, name, e.id);
    this.refreshTags(e);
  }

  /** Drop an entity from every index. */
  unindex(e: Entity): void {
    for (const type of e.components.keys()) this.removeFromSet(this.byComponent, type, e.id);
    for (const name of e.mixins) this.removeFromSet(this.byMixin, name, e.id);
    this.tags.clear(e.id);
    this.clearPosition(e.id);
  }

  /** Call after a component is added to `e`. */
  onComponentAdded(e: Entity, type: string): void {
    this.addToSet(this.byComponent, type, e.id);
    if (type === 'tags') this.refreshTags(e);
  }

  /** Call after a component is removed from `e`. */
  onComponentRemoved(e: Entity, type: string): void {
    this.removeFromSet(this.byComponent, type, e.id);
    if (type === 'tags') this.tags.clear(e.id);
  }

  /** Place or move an entity at `(levelId, cell)` in the spatial index. */
  place(id: EntityId, levelId: string, cell: Cell): void {
    this.clearPosition(id);
    const key = `${levelId}#${cell}`;
    this.addToSet(this.byCell, key, id);
    this.position.set(id, key);
  }

  /** Remove an entity's spatial position. */
  clearPosition(id: EntityId): void {
    const key = this.position.get(id);
    if (key === undefined) return;
    this.removeFromSet(this.byCell, key, id);
    this.position.delete(id);
  }

  // --- read side (Queries) ----------------------------------------------

  *with(...componentTypes: string[]): Iterable<Entity> {
    if (componentTypes.length === 0) return;
    // Drive iteration from the smallest set, preserving its insertion order.
    let smallest = this.byComponent.get(componentTypes[0]!) ?? EMPTY;
    for (let i = 1; i < componentTypes.length; i++) {
      const s = this.byComponent.get(componentTypes[i]!) ?? EMPTY;
      if (s.size < smallest.size) smallest = s;
    }
    for (const id of smallest) {
      const e = this.entities.get(id);
      if (e && componentTypes.every((t) => e.components.has(t))) yield e;
    }
  }

  *withMixin(name: string): Iterable<Entity> {
    for (const id of this.byMixin.get(name) ?? EMPTY) {
      const e = this.entities.get(id);
      if (e) yield e;
    }
  }

  at(cell: Cell, levelId?: string): Iterable<EntityId> {
    if (levelId !== undefined) return this.byCell.get(`${levelId}#${cell}`) ?? EMPTY;
    // No level given: search every level's bucket for this packed cell.
    const out: EntityId[] = [];
    const suffix = `#${cell}`;
    for (const [key, ids] of this.byCell) {
      if (key.endsWith(suffix)) out.push(...ids);
    }
    return out;
  }

  byTag(tag: string): Iterable<EntityId> {
    return this.tags.get(tag);
  }

  // --- internals ---------------------------------------------------------

  private refreshTags(e: Entity): void {
    const comp = e.components.get('tags') as { tags?: string[] } | undefined;
    if (comp?.tags) this.tags.set(e.id, comp.tags);
    else this.tags.clear(e.id);
  }

  private addToSet(map: Map<string, Set<EntityId>>, key: string, id: EntityId): void {
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(id);
  }

  private removeFromSet(map: Map<string, Set<EntityId>>, key: string, id: EntityId): void {
    const set = map.get(key);
    if (set) {
      set.delete(id);
      if (set.size === 0) map.delete(key);
    }
  }
}

/** Create a query index backed by the given entity map. */
export function createQueries(entities: Map<EntityId, Entity>): QueryIndex {
  return new QueryIndex(entities);
}
