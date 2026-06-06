# Roadmap — Build Order, Decisions & Test Targets

> Part of the **rlkit** engine spec — sections §20–22. The milestone build order, the resolved-decision log, and the per-system test targets.
>
> See also: 09-reference · 00-overview. Full map and reading order: [INDEX.md](./INDEX.md).

---

## 20. Build order (suggested milestones)

1. **Core skeleton** — Entity/Component, the generic `Registry<T>` (§6.3), `World = state + services` (§6), EventBus, RNG adapter, the `Cell`/`Point` coords helper (§8.1), and the entity query/index layer (§6.1). Tests for component get/set, queries, and the bus. Also land the dependency-free utilities here: tags (§11A.1), dice (§11A.6), weighted tables (§11A.7).
2. **Action pipeline + timeline + reactors** — typed `Action`/`GameEvent` unions, `resolve()` with validate-all-then-apply and the mutation-through-effects invariant, the reactor model + reaction loop (FIFO + depth guard, pre/post phases), the unified timeline with both clocks (§7.1, §7.3), and `move`/`wait`/`bump`. This is the heart; get it solid before anything else. (Delayed effects come free from the timeline here; triggers/zones build on it later.) Property-test determinism (same seed → same outcome) and reject/fizzle semantics.
3. **Map model + one generator** — Level, tile registry, BSP, reachability decorate. Spawn entities onto a level.
4. **Stats + resources + combat + status** — stat registry + modifier phase pipeline; resource pools with clamp/threshold/overflow+underflow events; damage as an `hp` delta; poison/regen/haste as proof status effects. Test the overflow/underflow event emissions explicitly. Bring in **geometry/targeting (§11A.3)** here, since combat/items need lines, LoS, and AoE shapes.
5. **Items/inventory/equipment** — items as entities, pickup/drop/equip/use.
6. **FOV + AI** — FOV adapter, visibility in render frame, simple AI mixins. Land **factions (§11A.2)** here; the field AI's goal sets read stance.
6b. **Field AI (§11.3)** — `FieldStore` (SoA Float32 grids, index math, composites) + the goal producer with property tests (distances correct, monotonic descent), then invalidation/dirty plumbing, flee derivation, `DesireAI`, and autoexplore as proof. Add scent and influence producers once the goal path is solid. This is the shipped headline feature; give it its own milestone.
7. **Render frame + canvas renderer** — buildFrame, CanvasRenderer, camera.
8. **Input + UI stack** — keymap, inventory/targeting modals, HUD, log.
9. **Save/load** — serialize/restore round-trip test.
10. **Remaining generators + decorators** — cellular, drunkard, prefab/vaults.
11. **Triggers + zones (§11A.5)** — place-scoped reactors on `entity:entered`/`exited`, with zones promoted from mapgen regions. (Delayed effects already exist from the timeline in milestone 2.) Proof content: a trap (trigger → delayed effect) and a room-ambush zone. Save/load round-trip with pending timeline effects.

The first eleven milestones land the engine the original spec described. The next six (12–17) are the **post-spec extensions** — each additive and backward-compatible (everything defaults to prior behavior, so the suite stays green). Full design in [11-modules-realtime-multiplayer.md](./11-modules-realtime-multiplayer.md) (§23–25).

12. **Level transitions (§24)** — a `stairs` component, `descend`/`ascend` handlers, a single `transitionEffect` (the sole writer for level changes: relocate, re-index, swap timeline membership by level), and an optional `services.levelProvider` that lazily builds + links the destination level. Save/load round-trips a mid-descent world.
13. **Look / info (§24)** — an `info` component (`name`/`description`), a pure `describeCell(world, levelId, cell)` query returning every entity on a tile topmost-first, and a message-log resolver hook so authored names flow into events.
14. **Command-dispatch registry (§24)** — `CommandTable`/`CommandHandler`/`CommandCtx` in the Session, so a game maps commands → behavior (submit action, push modal, re-dispatch) without forking the loop.
15. **Modules (§23)** — the `Module` interface + `orderModules`/`composeModules`/`assertModulesPresent` (topological by dependency, manifest recorded to `WorldState.modules`), wired into `createWorld`/`loadWorld`; then the six base modules (combat, progression, identification, ranged, hunger, doors). Each module is independently tested.
16. **Real-time driver (§25)** — `tickRealtime` (single player) over the same timeline via `peekNextDue`/`advanceClock`, non-blocking buffered input, fixed logical timestep. Determinism preserved (two identical runs).
17. **Co-op multiplayer (§25)** — `tickRealtimeMulti` (a set of players + AI), shared-union vs per-player FOV (`computeVisibilityUnion` / `computeVisibilityFor`, `visible:<id>`/`explored:<id>` layers), `buildFrame` parameterized by visibility layer, and the transport-agnostic `GameServer` (`join`/`enqueue`/`tick`/`viewFor`/`snapshot`) with `'shared'`/`'hidden'` fog. Networked reference: `examples/netcoop` (authoritative WebSocket host, per-player frames, headless wire round-trip).

Each milestone is independently testable against the headless core (12–17 add their targets in §22.15).

---

## 21. Decisions (resolved)

All forks from the prior draft are now settled:

1. **Coordinate keys** — *revised (rev 7):* packed integer `Cell = y*width+x` is canonical across the tile grid, spatial index, fields, and geometry; `Point {x,y}` is the API-edge form and an `"x,y"` string exists only for debug/logging. (Originally strings; reversed because the FieldStore, spatial index, and geometry primitives all require integer cells.)
2. **Time units** — one shared "energy" unit for both the scheduler and status durations, with a `turns→energy` config helper for authoring convenience.
3. **Bundler** — `tsdown` (fallback tsup).
4. **Determinism** — *guaranteed.* *All* engine randomness is routed through a single seeded `RNG` (`pure-rand`) with `fork()` sub-streams and order-stable iteration, so full reproducibility holds end-to-end and is guarded by tests (the golden run, §22.13; same-seed properties throughout §22). No `Math.random` anywhere. (Originally rated nice-to-have; the single-RNG discipline made it free, so it was promoted to an invariant — real-time and multiplayer both depend on it.)
5. **Mixin conflict resolution** — declaration order; an optional numeric priority can be added later without changing the model.
6. **Validation** — committed to **Zod, schema-first** (§16.4): persisted/authored types are Zod schemas with `z.infer`'d static types (single source of truth); runtime-only types stay plain interfaces. No type is declared twice.

---

*Spec is at rev 11. All milestones (§20), including the post-spec extensions 12–17 and the engine-requirements batch-1 primitives (tile flags, `setTile` effect, steppers, cell-network connectivity, events-out/perception, the `ActionMap`/`EventMap` merge seam, bump-interaction dispatch, generic view payload), are implemented and green — 356 tests across 81 files. The spec stays the source of truth; the code is kept consistent with it.*

---

## 22. Test targets

Tests are a **record of intended behavior**, not a snapshot of whatever the code currently does. A red test means one of two things: a real regression (fix the code) or the intended behavior changed (update the test to the new intent) — never paper over it. Three habits follow from that and from this engine's shape:

- **Test through public behavior, not internals.** Resolve actions and assert on resulting events and state; don't reach into private fields. The headless core (core/sim/mapgen/fields) needs no mocks or DOM.
- **Prefer property tests for invariants.** `fast-check` shrinks any failure to a minimal case, and because all randomness flows through the seeded `RNG` (decision 4), every failure reproduces from its seed.
- **Reserve snapshots for one thing:** the determinism golden-run (§22.13). Everything else asserts behavior.

Tags below: **[P]** property test · **[E]** example test · **[I]** integration test across systems.

### 22.1 Core — entity / component / registry / query

- [E] component get/set/has; container components hold multiple instances by inner id.
- [E] `Registry<T>` returns registered defs; unknown id throws a clear error.
- [P] schema-first validation: any value not matching a component's Zod schema is rejected at the boundary; valid values pass and infer the right type.
- [P] query layer: `with(A,B)` returns exactly the entities having both; results update after component add/remove; `at(cell)` reflects movement; `byTag` matches the tag index. Iteration order is stable.

### 22.2 RNG

- [P] same seed → identical sequence; `getState`/`setState` round-trips mid-stream; `fork()` streams are independent and don't perturb the parent.
- [P] `int(min,max)` stays in range; distribution is approximately uniform over many draws.

### 22.3 Coords & geometry

- [P] `cellOf`/`pointOf` round-trip; neighbor offsets never wrap across row edges.
- [E] `line` endpoints correct; `hasLoS` is blocked by an opaque tile and clear otherwise.
- [P] `cellsIn` for every shape stays within bounds and, when configured wall-blocking, excludes occluded cells.

### 22.4 Timeline (turns + delayed effects)

- [P] over N world ticks an actor with double `speed` acts ~twice as often; no actor is ever starved.
- [E] a scheduled effect fires exactly at its `fireAt` on the world clock; `cancel` prevents it; tie ordering is deterministic.
- [P] two clocks: a hasted, poisoned actor takes more poison ticks per *world* turn than a normal-speed one (status ticks on the per-actor clock); a world-clock field ticks once per world turn regardless of who acted.

### 22.5 Action / effect / event pipeline

- [E] `reject` → no time passes, no effects, world unchanged; `fizzle` → cost spent and queued effects applied; `done` → effects + events.
- [P] **validate-all-then-apply atomicity**: in a batch of effects where one fails `validate`, *none* apply (world identical to before). The headline correctness property.
- [E] upstream code sees a `ReadonlyWorld` — only effects mutate (type-level, plus a runtime guard test).
- [P] determinism: same seed + same input commands → identical event stream.
- [E] `ts-pattern` dispatch hits a catch-all for an unknown content action/event type rather than throwing.

### 22.6 Reactors & reaction loop

- [E] a pre-phase reactor reduces a pending damage effect (armor); a post-phase reactor enqueues a follow-up action.
- [P] FIFO drain order is deterministic; the depth guard breaks a self-feeding cascade (fire→oil→fire) at the configured limit and logs.
- [E] scope dispatch: an entity reactor fires only for its entity; a zone reactor only inside the zone; a global reactor always.

### 22.7 Stats & resources

- [P] modifier result is independent of gather order: shuffling modifiers yields the same value (phase order base→add→mul→clamp holds).
- [E] derived stat reflects equipment + status; removing the source updates it; clamps respected.
- [P] resource `current` is always within `[0,max]` for any delta sequence; every unit of input is accounted for as applied-or-lost.
- [E] overflow emits `resource:overflow` with correct `excess` and `cause`; a dropping `max` re-clamps and emits `cause:'max-reduced'` (distinct from `'restore'`); underflow emits `deficit`.
- [E] an action with a resource cost is rejected when the pool is insufficient.

### 22.8 Combat & status

- [P] HP never goes negative; computed damage stays within the configured formula's bounds; resistances reduce it.
- [E] reaching 0 HP fires `died`; overkill also emits `resource:underflow`.
- [I] `haste` raises `speed`, which measurably changes the actor's cadence on the timeline; poison drains HP each per-actor tick; expiry fires `onExpire`.

### 22.9 Items / inventory / equipment

- [E] pickup/drop moves the item entity between floor and inventory (same entity, two locations); capacity/weight enforced.
- [E] equip applies its `modifyStats`; unequip removes it; `useItem` consumes a charge and resolves its effect.

### 22.10 Map generation

- [P] **every seed yields a fully reachable level**: stairs and all decorated spawns are reachable from the entrance (the headline mapgen property). Generators emit only registered tile ids and stay within bounds.
- [E] BSP rooms don't overlap and are connected; prefab/vault stamping respects anchors.
- [P] same seed → identical map.

### 22.11 Fields & desire AI

- [P] goal scan distances match an independent BFS ground truth; walls and unreachable cells are `Infinity`; descending from any cell strictly decreases distance to a goal.
- [E] flee map: a cornered monster steps toward the door, not into the corner (the Brogue behavior).
- [E] scent is wall-aware — it does not bleed through an opaque wall; the trail decays over time.
- [P] `FieldStore.composite` equals the naive weighted sum; `Infinity` clamping keeps a negative weight from poisoning the sum.
- [E] dirty/perTurn/static lifecycle: a `wands` field recomputes only when a wand moves (assert recompute count); composites cache until a contributing field changes.
- [E] `DesireAI` steps to the lowest weighted-sum neighbor; ties break deterministically via RNG; goal sets are drawn from faction stance.

### 22.12 Factions, triggers, tags, utilities

- [E] `stanceBetween`: matrix lookup, with a per-entity override winning over it.
- [E] a trigger fires on the matching event + scope, gated by `testId`, and respects `once`; `entity:entered`/`exited` emit on movement.
- [P] `roll("2d6+3")` stays within `[5,15]` and is deterministic per seed; weighted `pick` approximates its configured distribution.

### 22.13 Save/load & the determinism harness

- [P] **round-trip**: `load(save(state))` deep-equals the original state across randomly generated worlds (the headline save property). The blob contains no functions; services rebuild from registries.
- [E] `devalue` preserves `Map`s and typed-array layers; pending timeline effects and RNG state survive, so a loaded game continues identically.
- [E] schema migration upgrades an old-version blob; a malformed blob is rejected by validation.
- [E/snapshot] **golden run**: a scripted sequence of inputs under a fixed seed produces a recorded event stream; this single snapshot guards end-to-end determinism and is updated deliberately when intended behavior changes.

### 22.14 Presentation (lighter; jsdom / canvas mock)

- [E] `buildFrame` applies FOV visibility (visible / explored-dim / hidden) and correct layer order.
- [E] input maps key → command → action; an open modal routes input to the top of the UI stack.

### 22.15 Extensions — transitions, look, modules, real-time, multiplayer (§23–25)

- [E] **Transitions**: `descend` relocates the actor to the linked level, re-indexes spatially, and swaps timeline membership (off-level actors frozen, on-level activated); an unlinked stair triggers `levelProvider` exactly once, then reuses the link. [P] `load(save(w))` round-trips a world mid-descent (pending timeline + per-level state intact).
- [E] **Look / info**: `describeCell` lists every entity on a tile topmost-first with its authored `name`/`description`; it costs no time and mutates nothing; the message-log resolver substitutes authored names into events.
- [E] **Command registry**: a custom `CommandTable` entry overrides a default; an item-default command falls through; `dispatch` re-entry routes correctly.
- [E] **Modules**: `orderModules` topologically sorts by `dependencies` and throws on a cycle or a missing dep; `composeModules` runs `setup` in order and records the manifest in `WorldState.modules`; `assertModulesPresent` rejects a save whose required modules are absent. Each base module has its own behavior test (e.g. a crit applies the configured multiplier; XP crossing the threshold levels up and refills; an unidentified cursed ring can't be removed until uncursed; a ranged attack respects LoS/range; satiation reaching zero starts starvation damage; a closed door blocks movement and FOV until opened).
- [P] **Real-time**: `tickRealtime` advances the world by N logical ticks without blocking; a buffered action is consumed on the player's due turn, otherwise it waits; two identical tick/input streams under one seed produce identical worlds (determinism preserved).
- [E/P] **Multiplayer**: `tickRealtimeMulti` resolves every player's buffered action in deterministic timeline order; **hidden fog** — with a monster only player B can see, `GameServer.viewFor(a)`'s frame omits that glyph while `viewFor(b)`'s includes it (the wire leaks nothing); **shared fog** shows it to both; `hp`/`alive` track the player and flip on death; leaving a player drops its per-level `visible:<id>`/`explored:<id>` layers; [P] the same join/enqueue/tick stream yields identical worlds. The headless WebSocket round-trip ([`examples/netcoop`](../examples/netcoop)) asserts two clients receive distinct per-player frames over the wire and that malformed/oversized input is sanitized server-side.

These targets map one-to-one onto the build milestones (§20): each milestone lands with the targets for the systems it introduces, so the headless core is always green before presentation is wired.
