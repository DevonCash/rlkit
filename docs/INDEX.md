# rlkit — Spec Index

The design spec for **rlkit**, a batteries-included TypeScript roguelike engine. The original single document was split into the focused files below; this index is the map. Content is verbatim — section numbers (`§N`) are preserved across files, so any `§N` cross-reference resolves via the lookup table at the bottom.

Status: **design complete, pre-code (rev 9).** No source written yet; the first build step is milestone 1 in [10-roadmap-and-tests.md](./10-roadmap-and-tests.md).

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

If you are an agent picking this up to build it: read 00, 01, 02, then jump to **10** for the milestone order, and pull in the others as each milestone needs them.

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

## Section → document lookup

`§1–4` → 00 · `§5–6` → 01 · `§7` → 02 · `§8` → 03 · `§9–10` → 04 · `§11` (incl. `§11.3`) → 05 · `§11A` → 06 · `§12–15` → 07 · `§16` → 08 · `§17–19` → 09 · `§20–22` → 10.

## How the design got here (rev history)

The spec was built up over several passes; later revisions reflect deliberate decisions, not churn:

- **rev 2** — adopted tooling: pure-rand (RNG), ts-pattern (dispatch), devalue (save), Vitest+fast-check (tests), Zod schema-first validation; rotJS reduced to FOV + pathfinding.
- **rev 3–4** — Dijkstra goal-map AI added, then generalized to a `Field` abstraction (goal/scent/influence) over one data-oriented `FieldStore`.
- **rev 5** — stats/resources generalized to two primitives; resource changes emit overflow/underflow events with a `cause` discriminator.
- **rev 6** — cross-cutting primitives added (tags, factions, geometry, timers, triggers, dice, weighted tables).
- **rev 7** — base-primitive refinements: typed Action/Event unions, entity query/index layer, reaction loop + two clocks, mutation-through-effects invariant; coordinates flipped to packed integers.
- **rev 8** — elegance unifications: one `Registry<T>`, one timeline, one reactor model (onAction = pre-phase reactor), `World = state + services`, layered-grid Level.
- **rev 9** — per-system test targets (§22).
