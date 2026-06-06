# Maps, Tiles & Generation

> Part of the **rlkit** engine spec — sections §8. The layered-grid Level, packed-integer coordinates, the tile registry, and the generation suite.
>
> See also: 01-core-model · 05-ai-and-fields. Full map and reading order: [INDEX.md](./INDEX.md).

---

## 8. Map model, tiles, and generation

### 8.1 Tiles and levels

```ts
interface TileType {
  id: string;                 // 'wall', 'floor', 'door', 'water'
  walkable: boolean;
  transparent: boolean;       // for FOV
  glyph: string; fg: string; bg?: string;
  tags?: string[];            // 'liquid', 'hazard'
  flags?: string[];           // extra registered flags: 'airtight', 'wire', ...
}

type Cell = number;            // canonical cell id within a level: y*width + x
interface Point { x: number; y: number; }   // ergonomic form for APIs; convert via cellOf/pointOf
```

**Tile flags (a registry, not hardcoded booleans).** Boolean per-cell properties
are a generic, game-extensible channel rather than fixed `TileType` fields. A
`FlagRegistry` (in `Services.flags`) assigns each flag name a bit, exactly as the
`TilePalette` assigns tiles an index; `walkable` and `transparent` are the two
**core flags** (bits 0,1 — the lingua franca the FOV/pathfinding adapters and the
field passable/transparent closures depend on), and games register more
(`airtight`, `wire`, `pipe`, …) before registering the tiles that use them. The
palette folds a tile's `walkable`/`transparent` booleans plus its named `flags`
into a precomputed bitmask, so `isWalkable`/`isTransparent` stay O(1) bit-tests.

A flag is composed from the tile **and** occupying entities: an entity carrying a
`tileFlags: { flags: string[] }` component contributes its bits at its cell. The
per-level `FlagIndex` (`Services.flagIndex`, `forLevel(id)`) maintains a Uint16
`flags` layer = `palette.flagBits(tile) | OR(occupant bits)`, rebuilt on creation
and kept current incrementally off `tile:changed` + movement events; when a cell's
mask shifts it emits `flags:changed { levelId, cell, before, after }`. Games that
mutate a flag component in place (e.g. an entity-door toggling `airtight`) call
`flagIndex.forLevel(id).invalidateCell(cell)`. The `flags` layer is a derived cache
(transient — §16). Up to 16 flags (Uint16).

**Tile mutation is an effect.** `setTileEffect(levelId, cell, toTileId)` swaps a
tile through the normal validate-then-apply pipeline and emits
`tile:changed { levelId, cell, from, to }` (palette indices), which the standard
invalidation consumers honor: a field with `invalidateOn: ['tile:changed']`
re-routes on its next read, the flag index recomputes the cell, and FOV — recomputed
each turn from live tiles — sees through it the same turn. Shared layer-lifecycle
helpers `ensureFloatLayer` / `ensureU8Layer` / `ensureU16Layer` get-or-create a
full-grid typed-array layer (used by fields, visibility, the flag index, steppers).

A level is a **layered grid**: a stack of typed per-cell layers over one shared `Cell` index space and neighbor math. Tiles are just one layer; AI fields (§11.3) are `Float32` layers in the same system; transient booleans (explored, blocked) are bitset layers. This unifies Level storage with the FieldStore — same indices, same offset tables, one place that knows the grid geometry.

```ts
type Layer = Uint16Array | Float32Array | Uint8Array;   // tiles | fields | flags/bitset

interface Level {
  id: string;
  width: number; height: number;
  layers: Map<string, Layer>;              // 'tiles' (Uint16 → tile registry), fields, flags...
  entityIndex: Map<Cell, EntityId[]>;      // cell -> occupants, kept in sync on move
  metadata: Record<string, unknown>;       // depth, theme, etc.
}
```

Tile types live in a **registry** (configurable content). The grid stores small integer ids for compactness and fast save/load. **Coordinates** (decision 1, revised): a packed integer `Cell = y*width+x` is the canonical id used by the tile grid, spatial index, fields, and geometry — neighbors are pure offset arithmetic and there is no per-cell string allocation in hot loops. `Point {x,y}` is the ergonomic form at API edges; an `"x,y"` string helper exists only for logging/debugging.

### 8.2 Generation suite

A generator is anything implementing the interface; the engine ships several and you can register your own.

```ts
interface MapGenerator {
  id: string;
  generate(params: GenParams, rng: RNG): GeneratedMap;
}

interface GeneratedMap {
  width: number; height: number;
  tiles: Uint16Array;
  regions?: Region[];          // rooms/areas for downstream placement
  connections?: Edge[];        // for corridors / graph reasoning
  spawnHints?: SpawnHint[];     // where to put stairs, monsters, loot
}
```

Shipped generators:

- **BSP rooms** — recursive partition, rooms + corridors. Good for dungeons.
- **Cellular automata** — organic caves.
- **Drunkard's walk** — winding tunnels / sparse caverns.
- **Prefab / vault stamping** — stamp hand-authored room templates (ASCII or JSON) with anchors and constraints; composes with the above.

Generators are pure functions of `(params, rng)`, so a seed reproduces a map (part of the engine's guaranteed determinism). Generation **decorators** run as a post-pass: place stairs, distribute monsters/items from spawn tables (configurable content), connect disconnected regions, validate reachability.

A `LevelBuilder` orchestrates: pick generator → run → decorate → register tiles → spawn entities. Multi-level dungeons are a list of `Level`s linked by stair entities.

---
