# AI — FOV, Pathfinding, Fields & Desire AI

> Part of the **rlkit** engine spec — sections §11 (incl. 11.3). The rotJS FOV/pathfinding adapters and the field system: the data-oriented FieldStore, the goal/scent/influence producers, and desire-driven AI.
>
> See also: 06-cross-cutting-primitives · 03-maps-and-generation. Full map and reading order: [INDEX.md](./INDEX.md).

---

## 11. FOV, pathfinding, AI (adapters)

### 11.1 Adapter interfaces (rotJS lives behind these)

```ts
// Revised (M6): FOV returns packed Cell ids, not "x,y" strings — the visibility
// layer is a Uint8Array keyed by Cell (§8.1), so returning Cells avoids string
// repacking on the per-turn hot path. `width` is passed so the wrapper can pack.
// The interfaces live in core (core/fov.ts, core/path.ts) so sim can consume
// them without importing adapters; the rotJS impls are injected at the edge
// (the RNG precedent). Out-of-bounds cells must read as opaque/impassable.
interface FovProvider {
  compute(origin: Point, radius: number, isTransparent: (p: Point) => boolean, width: number): Set<Cell>;
}
interface PathProvider {
  path(from: Point, to: Point, isPassable: (p: Point) => boolean): Point[];
}
interface RNG {
  next(): number;             // [0,1)
  int(min: number, max: number): number;
  pick<T>(arr: T[]): T;
  shuffle<T>(arr: T[]): T[];
  fork(): RNG;                // independent sub-stream seeded from this one
  getState(): unknown; setState(s: unknown): void;   // for save/replay
}
```

The FOV and pathfinding adapters wrap `ROT.FOV.PreciseShadowcasting`/`RecursiveShadowcasting` and `ROT.Path.Dijkstra`/`AStar` — that is rotJS's entire remaining footprint, two small files. The computed FOV is written into a Level's typed `Uint8Array` visibility layers; `sim/visibility.ts` offers three flavors over the same machinery (§25): `computeVisibility` (one viewer into the shared `visible`/`explored` layers), `computeVisibilityUnion` (co-op shared fog — the union of several viewers), and `computeVisibilityFor` (per-player **hidden-info**, into private `visible:<id>`/`explored:<id>` layers that `buildFrame` can target so one player's frame never contains another's vision). The **RNG is backed by `pure-rand`** (xoroshiro128+), not rotJS: its immutable generator state makes `getState`/`setState` trivial and exact, which is what gives us reproducible mapgen, combat, and save-continuation. All engine randomness flows through a single `RNG` instance; `fork()` creates independent sub-streams (one per concern — mapgen, combat, loot) seeded from a master, so adding a combat roll doesn't shift the map sequence. Because every provider is injected, swapping any of them out means replacing one class.

### 11.2 AI

AI is mixin-driven. When the timeline gives an AI entity a turn, its AI mixin (`AIWanderer`, `AIHunter`, `AIRanged`, …) inspects the world and returns an `Action`. The hook is `Mixin.takeTurn?(self, world): Action | undefined` (added in M6); `decideAction(world, id)` iterates the entity's mixins in declared order and returns the **first non-`undefined`** — so a "smart guard" is a stack of AI mixins with a priority order, and `undefined` means "I decline, try the next." (The driver — turn-based or real-time, §25 — feeds the chosen action to `resolve`/`perform`; `decideAction` is also unit-tested directly without a driver. The same `decideAction` runs every non-player actor in co-op, so AI is identical single- or multi-player.) Shared helpers (`pathToward`, `nearestHostile`, `canSee`) use the adapters. AIHunter attacks by returning a `bump` (its redirect becomes an attack), reusing the player's "step or fight" path.

For anything beyond simple chase/flee, the recommended path is the field system (§11.3) and the `DesireAI` mixin, which expresses rich behavior as data (weighted desires over goal/scent/influence fields) rather than hand-written state machines.

### 11.3 Fields: goal (Dijkstra), scent & influence maps — shipped battery

The engine's headline AI feature. A **field** is a per-level scalar grid; AI reads fields to decide where to move. All three classic techniques are the *same data structure* with different update rules, so they share one storage layer (§11.3.4) and `DesireAI` (§11.3.5) consumes any of them uniformly. The original goal-map technique is Brian Walker's *The Incredible Power of Dijkstra Maps* (Brogue).

#### 11.3.1 The Field abstraction

```ts
type FieldId = string;
type FieldKind = 'goal' | 'scent' | 'influence';

interface FieldDescriptor<P = unknown> {
  id: FieldId;
  kind: FieldKind;
  params: P;                 // producer-specific configurable values
  diagonals?: boolean;
  invalidateOn?: string[];   // event types that dirty this field (goal/influence)
  perTurn?: boolean;         // ticks every turn (scent, decaying influence)
  static?: boolean;          // computed once at level gen, never updated
}

// A producer writes into a caller-owned Float32Array — never allocates per update.
interface FieldProducer<P> {
  kind: FieldKind;
  recompute(out: Float32Array, ctx: FieldCtx, params: P): void;   // full rebuild
  step?(out: Float32Array, ctx: FieldCtx, params: P): void;       // incremental per-turn
}
// FieldCtx exposes width/height, tile passability/transparency, goal-cell iteration, and the RNG.
```

#### 11.3.2 Producers

- **Goal (Dijkstra).** `recompute` runs a **multi-source BFS** from all goal cells at once — one linear `O(cells)` pass (a small priority queue only if diagonal/terrain step costs differ, which are configurable). Each passable cell ends up holding step distance to the nearest goal; walls and unreachable cells are `+Infinity`. Rolling downhill reaches the nearest goal optimally. For combat AI, the goal and threat cells are the entities whose stance is `allied`/`hostile` per §11A.2 — not a hardcoded reference to the player. **Flee/safety** is the same producer with a post-step: multiply by a negative coefficient (≈ `-1.2`, configurable) and re-scan, so fleers head for exits and pillar-dance instead of cornering themselves.

- **Scent.** Carries temporal memory. `step` each turn: deposit at source cells, decay all cells by a factor, and diffuse into neighbors — **wall-aware** (no bleeding through non-transparent tiles). Rolling uphill follows a cooling trail to where a target *went*, not where it *is*. Deposit amount, decay, and diffusion rate are configurable.

- **Influence.** Tactical pressure. `recompute` (or `step` for decaying influence) stamps each source's strength with distance falloff and sums contributions; threats are negative, allies positive. The field encodes how contested/dangerous each cell is — used for threat avoidance, territory, pack spacing. Falloff radius and source weights are configurable.

#### 11.3.3 Relationship to point-to-point pathfinding

Fields largely supersede the rotJS `PathProvider` for *monster* navigation (downhill on a shared field beats per-actor A*). rotJS pathfinding remains for one-off queries — a single auto-travel route, or reachability checks during map decoration.

#### 11.3.4 Storage & querying — the data-oriented `FieldStore`

The hot path is `DesireAI`: per turn, every AI actor sums weighted field values over up to 9 candidate cells. Naively (one object per field, scattered `Float64Array`s, `"x,y"` lookups) that is `actors × 9 × desires` cache-missing reads. The store is built to collapse that.

**Structure-of-arrays, one typed array per field.** Each field is a flat `Float32Array` of length `width*height`, indexed `i = y*width + x` — i.e. a `Float32` **layer** in the Level's layered grid (§8.1), so fields, tiles, and flags all share the same `Cell` space, offset tables, and geometry code. Float32 halves bandwidth versus Float64 and is ample precision for distances/scent (and avoids mixing integer/float types when composing). Fields get a stable integer index in the store. Neighbors are pure index arithmetic via a precomputed offset table (`i±1`, `i±width`, `i±width±1`, with row-edge guards) — these are the canonical packed-integer cell ids (§8.1); no coordinate strings appear in this loop.

```ts
interface FieldStore {                 // one per Level
  readonly width: number; readonly height: number;
  ensure(desc: FieldDescriptor): number;          // register → stable index
  data(id: FieldId): Float32Array;                // raw grid (read/scan)
  composite(profile: DesireProfile): Float32Array;// weighted sum, cached this turn
  bestStep(field: Float32Array, i: number, diagonals?: boolean): number; // neighbor index or -1
  markDirty(id: FieldId): void;
  tick(ctx: FieldCtx): void;                       // update dirty + perTurn fields
}
```

**Axis-order tradeoff (the core question).** Two competing access patterns:

- *Updates* (BFS scan, diffusion) sweep one field across all cells → want each field contiguous → **field-major** (`field[i]`), which is what per-field arrays give.
- *Queries* (sum many fields at one cell) → want all fields for a cell adjacent → **cell-major interleaved** (`packed[i*numFields + f]`).

You can't optimize both layouts at once. Resolution: keep field-major arrays (updates are the heavy, frequent producers and benefit most), and beat the query pattern a different way —

**Composite precomputation, bucketed by desire profile.** Most actors are archetypes sharing identical desire weights (every goblin wants the same things). Bucket actors by their `DesireProfile` (the set of `(fieldId, weight)`). Once per turn, for each *distinct active* profile, compute its composite `Σ wᵢ·fieldᵢ` in a single linear pass into a scratch `Float32Array`. Then every actor with that profile just calls `bestStep(composite, i)` — one contiguous array, 9 reads. This turns `actors × 9 × desires` scattered reads into `profiles × cells × desires` sequential reads + `actors × 9`. With many monsters of few archetypes (the common case), it's a large win, and composites cache until a contributing field changes. Actors with genuinely dynamic per-individual weights (rare — a uniquely enraged monster) fall back to on-the-fly summation; if those ever become common, an interleaved mirror is the escape hatch, at the cost of doubled write bandwidth.

**Composition has to handle `Infinity`.** Unreachable goal cells are `+Infinity`; a negative weight would flip that to `-Infinity` and poison the sum. Composition clamps each field to a configurable finite `maxDistance` before weighting (also what keeps far-away desires bounded). Walls stay excluded from candidate steps entirely.

**Dirty / per-turn / static flags.** The store only updates what changed: `invalidateOn` fields rescan when their event fires (a `wands` field only when a wand is picked up/dropped), `perTurn` fields (scent, decaying influence) tick every turn, `static` fields (hazard-escape) compute once at level gen. All actors share all fields. The store subscribes to the event bus for invalidation, so it stays inside the headless core.

**Memory** is modest: `numFields × cells × 4` bytes per level (≈256 KB for 20 fields on an 80×40 map; a few MB on very large maps). Only the active level's `perTurn` fields tick.

> **Implementation notes (M6b).** (1) **Field data are Float32 `Level.layers`** keyed `field:<id>` (§8.1), so they share the cell space; the store (a service) holds descriptors/dirty/versions/composite-cache/scratch/bus-subs and is rebuilt per level (not serialized). (2) **Goal sets are faction-relative and shared**: a goal field is one of `{kind:'stance', stance, faction}` / `{kind:'unexplored'}` / `{kind:'cells'}`, resolved against the world by the store; the `stance` source uses the faction *matrix* only (per-entity charm/fear overrides do not steer shared fields). The field id encodes the selector so two factions get distinct shared fields. (3) **Composite caching** is keyed by the profile and validated by per-field *version counters* (no turn boundary needed): a cached composite is reused until a contributing field's version changes. (4) **Flee** = compute the threat map, scale finite cells by a negative `fleeCoefficient`, then **re-Dijkstra to a fixed point** (so the gradient leads to exits, not dead ends). (5) **Scent diffusion is gated by `transparent`** (an opaque wall blocks scent; an open arch passes), double-buffered through the store scratch.

#### 11.3.5 `DesireAI` mixin (unchanged by generalization)

```ts
// Component → defined schema-first (Zod) per §16.4; shown as an interface for readability.
interface Desire { fieldId: FieldId; weight: number; }   // weights are blueprint/config data
interface DesireAIData extends Component {
  type: 'desire-ai';
  desires: Desire[];        // e.g. player:-2.0, scent:1.5, allies:0.5, threat:-1.5, wands:3.0
}
```

Each turn the mixin resolves the actor's composite (via the store), takes `bestStep`, and returns the matching `move` action; ties break on the seeded `RNG` for reproducibility. Desires are *data* and may change at runtime (hunger rising, fear spiking); the summation is the logic. A field of any kind — goal, scent, or influence — is just a `fieldId` in the list, so a wolf `{ scent: 2.0, allies: 0.5, threat: -1.5 }` tracks by smell, stays with the pack, and avoids danger with no special-casing.

#### 11.3.6 Shared utilities (fall out for free)

- **Autoexplore**: a goal field whose goals are undiscovered tiles (undiscovered walls treated as floor); player rolls downhill, halting on a new message or newly-seen monster.
- **Auto-travel**: a transient goal field to the chosen destination, respecting per-actor passability.
- **Hazard-escape routing**: a `static` goal field giving "steps to safe ground" from inside lava/water — warns before a levitation/swim effect expires mid-crossing and marks tiles impassable for routing when an effect won't last.

---
