# Cross-cutting Primitives & Utilities

> Part of the **rlkit** engine spec — sections §11A. Tags, factions/relationships, geometry/targeting, timers/delayed effects, triggers/zones, dice expressions, and weighted tables.
>
> See also: 02-simulation · 05-ai-and-fields. Full map and reading order: [INDEX.md](./INDEX.md).

---

## 11A. Cross-cutting primitives & content utilities

Small, reusable primitives that many systems lean on. Each composes with the existing pipeline (effects/events/RNG/registries) rather than bypassing it, and each serializes **by reference** — closures are never stored; timers and triggers reference registered ids, consistent with §16.

### 11A.1 Tags

Cheap queryable membership for ad-hoc categorization (`'undead'`, `'flammable'`, `'metal'`, `'boss'`). Distinct from components (data) and mixins (behavior).

```ts
interface Tagged extends Component { type: 'tags'; tags: string[]; }   // schema-first (§16.4)
// Tiles carry tags in TileType.tags. Each Level keeps a TagIndex updated incrementally:
//   level.withTag('flammable') -> entities/cells, so "spread fire to flammable neighbors" is a lookup.
```

### 11A.2 Factions & relationships

Closes a latent dependency in §11.3: the AI's "allies"/"threat" goal sets need a notion of allegiance. A configurable hostility matrix plus per-entity overrides for charm/fear/grudges.

```ts
type FactionId = string;
type Stance = 'hostile' | 'neutral' | 'allied';

interface Allegiance extends Component {            // schema-first (§16.4)
  type: 'allegiance';
  faction: FactionId;
  overrides?: Record<EntityId, Stance>;             // charm, fear, personal grudge
}
interface FactionTable { stance(a: FactionId, b: FactionId): Stance; }   // config matrix
function stanceBetween(world: World, a: Entity, b: Entity): Stance;      // override beats matrix
```

The field/desire AI builds goal sets from this: an actor's *threat*/*flee* fields use entities that are `hostile` to it, *allies* fields use `allied`. This is what replaces "everything hates the player" and enables monster infighting, summons, and charmed allies for free.

### 11A.3 Geometry & targeting

Needed by every ranged attack, thrown item, explosion, and AoE. One primitive feeds both the targeting UI (preview) and effect application (resolve over cells).

```ts
function line(a: Point, b: Point): Point[];                 // Bresenham
function hasLoS(level: Level, a: Point, b: Point): boolean; // transparency along the line

type Shape =
  | { kind: 'blast'; radius: number }
  | { kind: 'cone'; dir: Point; angle: number; range: number }
  | { kind: 'beam'; dir: Point; range: number }
  | { kind: 'ring'; radius: number };

function cellsIn(origin: Point, shape: Shape, level: Level): Point[];
```

Whether a shape is blocked by walls / stops at the first obstacle is a configurable value per use; the geometry is logic.

### 11A.4 Timers & delayed effects

Beyond status durations: "detonate in 3 turns," "gas dissipates," "summon expires," "trap arms next turn." These are **one-shot entries on the unified timeline (§7.1)** — not a separate queue. Scheduling a delayed effect is `timeline.schedule(delay, effectId, payload)`; when its entry comes due the timeline looks up `effectId` in the effect registry (§6.3, the same one statuses and consumables use) and runs it through the normal effect→event path. No closures are stored, so save/load is trivial.

### 11A.5 Triggers & zones

Tiles and regions can't hold mixins (they aren't entities), so reactive rules attached to *places* are simply **reactors at `cell`/`zone` scope** (§7.3) — the same mechanism mixins use at entity scope. **Zones** are named areas (promoted from the `regions` mapgen already emits); a **trigger** is a place-scoped reactor expressed as data (`event → condition → effect`) attached to a tile type, a cell, or a zone.

```ts
interface Zone { id: string; cells: Iterable<Point>; data?: Record<string, unknown>; }
interface Trigger {                       // schema-first; testId/effectId reference registries
  on: string;                             // event type, e.g. 'entity:entered'
  scope: 'tile' | 'cell' | 'zone';
  testId?: string;                        // optional predicate from a registry
  effectId: string;
  once?: boolean;
}
```

Movement emits `entity:entered`/`entity:exited`; the trigger system matches scope + `testId` and runs `effectId`. This is the home for pressure plates, traps, on-step hazards, room ambushes, and biome auras.

### 11A.6 Dice expressions (utility)

A content-facing helper so config can express randomness directly. Deterministic through the seeded RNG.

```ts
function roll(expr: string, rng: RNG): number;   // "2d6+3", "1d20", "3d4-1"
```

Used by damage formulas, loot amounts, and generation parameters.

### 11A.7 Weighted tables (utility)

One weighted random-pick reused by spawn tables, drop tables, and generation. Weights are configurable content.

```ts
interface WeightedTable<T> { entries: { value: T; weight: number }[]; }
function pick<T>(table: WeightedTable<T>, rng: RNG): T;
```

---
