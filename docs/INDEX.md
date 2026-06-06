# rlkit — Spec Index

The design spec for **rlkit**, a batteries-included TypeScript roguelike engine. The original single document was split into the focused files below; this index is the map. Content is verbatim — section numbers (`§N`) are preserved across files, so any `§N` cross-reference resolves via the lookup table at the bottom.

Status: **implemented (rev 11).** Every milestone in [10-roadmap-and-tests.md](./10-roadmap-and-tests.md) (§20) is built and green — 356 tests across 81 files — plus the post-spec extensions (opt-in modules, level transitions, look/info, the real-time driver, and co-op multiplayer) documented in [11-modules-realtime-multiplayer.md](./11-modules-realtime-multiplayer.md) (§23–25), and the **engine-requirements batch 1** primitives (tile-flag registry + composed flags layer, the `setTile` effect, per-world-tick steppers, cell-network connectivity, the events-out/per-viewer-perception surface, the real `ActionMap`/`EventMap` merge seam, bump-interaction dispatch, and the generic per-player view payload). The spec remains the source of truth: code is kept consistent with these docs, not the other way around.

## Reading order

For a first read, go top to bottom — the docs are ordered so each builds on the last:

1. [00-overview.md](./00-overview.md) — what it is and the shape of it. **Start here.**
2. [01-core-model.md](./01-core-model.md) — the data model everything else sits on.
3. [02-simulation.md](./02-simulation.md) — the action/effect/event spine and the timeline.
4. [03-maps-and-generation.md](./03-maps-and-generation.md) — the world the simulation runs on.
5. [04-rules-stats-resources.md](./04-rules-stats-resources.md) — stats, resources, combat, items.
6. [05-ai-and-fields.md](./05-ai-and-fields.md) — FOV, pathfinding, and the field/desire AI.
7. [06-cross-cutting-primitives.md](./06-cross-cutting-primitives.md) — tags, factions, geometry, timers, triggers, dice, tables.
8. [07-presentation.md](./07-presentation.md) — events/log, rendering, input, UI.
9. [08-persistence.md](./08-persistence.md) — save/load and validation.
10. [09-reference.md](./09-reference.md) — module map, public API, tooling.
11. [10-roadmap-and-tests.md](./10-roadmap-and-tests.md) — build order, decisions, test targets.
12. [11-modules-realtime-multiplayer.md](./11-modules-realtime-multiplayer.md) — the post-spec extensions: opt-in modules, level transitions, look/info, real-time, and co-op multiplayer.

If you are an agent picking this up: read 00, 01, 02 for the model and spine, **10** for how it was built and what's tested, and **11** for the systems layered on after the original spec.

## The documents

| Doc | Sections | What's inside | Reach for it when |
|---|---|---|---|
| [00-overview](./00-overview.md) | §1–4 | Purpose, scope (in/out), the five design pillars, the four-layer architecture. | Orienting; deciding whether something belongs in scope. |
| [01-core-model](./01-core-model.md) | §5–6 | Entities as data + behavior **mixins**, blueprints, `World = state + services`, the query/index layer, the `fork()` seam, the generic `Registry<T>` and the serialize-by-name rule. | Working on entities, components, world wiring, or anything that registers/serializes. |
| [02-simulation](./02-simulation.md) | §7 | The `Action → Effect → Event` pipeline (validate-all-then-apply, reject/fizzle), the unified **timeline** (turns + delayed effects), the **reactor** model (pre/post phases), the reaction loop, the two clocks. | The engine's heart — any turn, action, mutation, or event behavior. |
| [03-maps-and-generation](./03-maps-and-generation.md) | §8 | The **layered-grid** Level, packed-integer `Cell` coordinates, the tile registry, the generator interface and the generation suite. | Map representation, coordinates, or dungeon generation. |
| [04-rules-stats-resources](./04-rules-stats-resources.md) | §9–10 | **Stats** (derived, modifier phases) and **resources** (bounded pools, `changeResource`, overflow/underflow events with `cause`); combat and status as consumers; items/inventory/equipment. | HP/mana/hunger, damage, buffs, items, equipment. |
| [05-ai-and-fields](./05-ai-and-fields.md) | §11 | rotJS FOV/pathfinding adapters; the **field system** — goal (Dijkstra), scent, influence — over the data-oriented **FieldStore**; the `DesireAI` mixin; autoexplore/auto-travel/hazard-escape. | Monster behavior, pathing, targeting fields, the headline AI feature. |
| [06-cross-cutting-primitives](./06-cross-cutting-primitives.md) | §11A | Tags, factions/relationships, geometry/targeting (lines/LoS/shapes), timers/delayed effects, triggers/zones, dice expressions, weighted tables. | Anything ranged/AoE, traps, factions, content randomness. |
| [07-presentation](./07-presentation.md) | §12–15 | Event bus + message log, the headless `RenderFrame` + canvas renderer, input mapping, the UI/modal stack. | Drawing, input, HUD/menus — the layers above the core. |
| [08-persistence](./08-persistence.md) | §16 | Serializing `WorldState` with devalue, reconstructing services, schema migration, Zod boundary validation (§16.4). | Save/load, content/save validation. |
| [09-reference](./09-reference.md) | §17–19 | The `src/` module map, the public API sketch, build/test tooling (tsdown, Vitest+fast-check) and the runtime dependency surface. | Setting up the project, finding where a file should live. |
| [10-roadmap-and-tests](./10-roadmap-and-tests.md) | §20–22 | The milestone **build order**, the resolved-**decisions** log, and the per-system **test targets**. | Deciding what to build next and what to test. |
| [11-modules-realtime-multiplayer](./11-modules-realtime-multiplayer.md) | §23–25 | The **post-spec extensions**: the opt-in **module** system + the six base modules; level **transitions**, the **look/info** query; the **real-time** drivers and the authoritative co-op **GameServer** (shared + hidden-info fog). | Composing feature bundles, multi-level dungeons, real-time/multiplayer. |

## Section → document lookup

`§1–4` → 00 · `§5–6` → 01 · `§7` → 02 · `§8` → 03 · `§9–10` → 04 · `§11` (incl. `§11.3`) → 05 · `§11A` → 06 · `§12–15` → 07 · `§16` → 08 · `§17–19` → 09 · `§20–22` → 10 · `§23–25` → 11.

## How the design got here (rev history)

The spec was built up over several passes; later revisions reflect deliberate decisions, not churn:

- **rev 2** — adopted tooling: pure-rand (RNG), ts-pattern (dispatch), devalue (save), Vitest+fast-check (tests), Zod schema-first validation; rotJS reduced to FOV + pathfinding.
- **rev 3–4** — Dijkstra goal-map AI added, then generalized to a `Field` abstraction (goal/scent/influence) over one data-oriented `FieldStore`.
- **rev 5** — stats/resources generalized to two primitives; resource changes emit overflow/underflow events with a `cause` discriminator.
- **rev 6** — cross-cutting primitives added (tags, factions, geometry, timers, triggers, dice, weighted tables).
- **rev 7** — base-primitive refinements: typed Action/Event unions, entity query/index layer, reaction loop + two clocks, mutation-through-effects invariant; coordinates flipped to packed integers.
- **rev 8** — elegance unifications: one `Registry<T>`, one timeline, one reactor model (onAction = pre-phase reactor), `World = state + services`, layered-grid Level.
- **rev 9** — per-system test targets (§22).
- **rev 10** — implementation landed all milestones, then grew past the original spec: opt-in **modules** (combat/progression/identification/ranged/hunger/doors), multi-level **transitions**, a **look/info** query, a command-dispatch registry, **real-time** drivers (`tickRealtime`/`tickRealtimeMulti`), and an authoritative co-op **GameServer** with shared and per-player (hidden-info) fog. Captured in [11-modules-realtime-multiplayer.md](./11-modules-realtime-multiplayer.md) (§23–25); determinism promoted from nice-to-have to a guaranteed, test-guarded property.
- **rev 11** — engine-requirements **batch 1** (game-designer asks R1–R6, plus a folded-in R7): a tile-**flag registry** (`walkable`/`transparent` become bits 0/1; games add `airtight`/`wire`/…) with a maintained composed **`flags` layer** and a `tileFlags` entity component; `setTileEffect` + `tile:changed`/`flags:changed`; per-world-tick **steppers** (`registerStepper`); a reusable **cell-network** connectivity index; `EventBus.onAny` + `ServerUpdate.events` and the `canViewerSee` per-viewer predicate; the now-real declaration-merged **`ActionMap`/`EventMap`**; **bump-interaction** dispatch (attack-on-bump becomes a registered rule); a generic **`PlayerView<E>`/`viewExtra`**. Also structural: the field **engine** promoted to `sim/field.ts` (a primitive; AI producers/`DesireAI` stay the bundled mechanic), a transient-layer save convention, and the shared `ensure*Layer` + `core/graph` kernels.
