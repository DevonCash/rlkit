/**
 * tags — the `Tagged` component and an incremental tag index (§11A.1).
 *
 * A `tags` component carries free-form string tags on an entity. The
 * `TagIndex` keeps `tag -> entity ids` updated as entities gain/lose tags, so
 * `byTag('flammable')` is a lookup, not a scan. Iteration is insertion-stable
 * (Set order) for determinism.
 */
import { z } from 'zod';
import type { EntityId } from './entity';

export const Tagged = z.object({
  type: z.literal('tags'),
  tags: z.array(z.string()),
});
export type Tagged = z.infer<typeof Tagged>;

export class TagIndex {
  private byTag = new Map<string, Set<EntityId>>();
  private byEntity = new Map<EntityId, Set<string>>();

  /** Replace the full tag set for an entity, updating the reverse index. */
  set(id: EntityId, tags: readonly string[]): void {
    this.clear(id);
    if (tags.length === 0) return;
    const owned = new Set(tags);
    this.byEntity.set(id, owned);
    for (const tag of owned) {
      let set = this.byTag.get(tag);
      if (!set) {
        set = new Set();
        this.byTag.set(tag, set);
      }
      set.add(id);
    }
  }

  /** Remove an entity from the index entirely. */
  clear(id: EntityId): void {
    const owned = this.byEntity.get(id);
    if (!owned) return;
    for (const tag of owned) {
      const set = this.byTag.get(tag);
      if (set) {
        set.delete(id);
        if (set.size === 0) this.byTag.delete(tag);
      }
    }
    this.byEntity.delete(id);
  }

  /** Entity ids carrying `tag`, in insertion order. */
  get(tag: string): Iterable<EntityId> {
    return this.byTag.get(tag) ?? EMPTY;
  }

  has(id: EntityId, tag: string): boolean {
    return this.byEntity.get(id)?.has(tag) ?? false;
  }
}

const EMPTY: ReadonlySet<EntityId> = new Set();
