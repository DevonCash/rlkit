# Persistence — Save/Load & Validation

> Part of the **rlkit** engine spec — sections §16. Serializing WorldState with devalue, reconstructing services from registries, schema migration, and Zod boundary validation.
>
> See also: 01-core-model · 09-reference. Full map and reading order: [INDEX.md](./INDEX.md).

---

## 16. Save / load

Because state is data and behavior is referenced by name (mixins/handlers/effects in registries), the world serializes cleanly.

Strategy:

- **Serialize**: the snapshot is exactly `WorldState` (§6) — nothing else is serializable. That's entities (component maps + mixin name lists), levels (layer arrays as base64-encoded typed arrays, entity indices rebuildable), timeline state (turn order + pending delayed effects), RNG state (`pure-rand` generator state), turn counter, config id/version. Per §6.3, state holds only names; functions/services are never serialized. The envelope is encoded with **`devalue`**, which preserves the `Map`s and shared references and parses faster/smaller than the alternatives; layer grids stay as our own base64 typed-array encoding for compactness.
- **Deserialize**: read snapshot → **validate against the save schema (§16.4)** → reconstruct `Services` from the registries → resolve component/mixin/handler/effect names → rebuild entities, indices, and the timeline. (This is the same operation `fork()` would use, minus the copy.)
- **Versioning**: snapshot carries a `schemaVersion`; a migration table (config) upgrades old saves before validation against the current schema.

```ts
interface SaveBlob { schemaVersion: number; world: SerializedWorld; }
interface Storage { save(slot: string, blob: SaveBlob): Promise<void>; load(slot: string): Promise<SaveBlob | null>; }
```

`Storage` is an adapter (localStorage, IndexedDB, file, memory). Restoring RNG state gives reproducible continuation; full run replay (recording the action stream) is a possible later add-on, enabled by the action pipeline but not in initial scope.

### 16.4 Boundary validation (Zod, schema-first)

Two boundaries take data the engine didn't produce itself: **authored content** (blueprints, tile types, effect definitions) and **loaded save blobs** (possibly old or hand-edited). Both are validated with **Zod v4** at the edge — never in hot loops.

The committed rule, to avoid any duplication: **persisted/authored data types are defined as Zod schemas and their TypeScript types are inferred with `z.infer`.** The schema is the single source of truth; there is no parallel hand-written interface. This covers components (§5.1), `Blueprint`, `TileType`, status/effect definitions, and the `SaveBlob`. Runtime-only types that are never serialized (`Action`, `GameEvent`, `ActionContext`, `RenderFrame`, mixin definitions) remain plain hand-written interfaces — they don't cross a boundary, so they need no schema and get no second declaration either.

```ts
// content/validate.ts
const SaveBlob = z.object({
  schemaVersion: z.number().int(),
  world: SerializedWorld,          // composed from the component/level schemas
});
type SaveBlob = z.infer<typeof SaveBlob>;

export const parseSave = (raw: unknown): SaveBlob => SaveBlob.parse(raw);   // throws on bad data
export const parseBlueprint = (raw: unknown): Blueprint => Blueprint.parse(raw);
```

Validation runs in exactly two places: when content is registered, and inside `load()` after migration and `devalue` decoding. Everywhere else, data is already typed and trusted. To keep the shipped bundle lean, the engine imports from `zod/mini` (same schemas, smaller footprint) where the full Zod surface isn't needed.

---
