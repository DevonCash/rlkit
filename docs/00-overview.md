# Overview, Scope & Architecture

> Part of the **rlkit** engine spec — sections §1–4. Why the engine exists, what is in and out of scope, the five design pillars, and the four-layer architecture.
>
> See also: 01-core-model · 10-roadmap-and-tests. Full map and reading order: [INDEX.md](./INDEX.md).

---

## 1. Purpose

A batteries-included TypeScript roguelike engine. It goes further than rotJS by shipping the systems most roguelikes rewrite every time: an energy-based turn scheduler, an action pipeline, stats/combat/status effects, items/inventory/equipment, map generation, a headless render model with a canvas adapter, input mapping, a UI/modal layer, and save/load.

rotJS is used **selectively** — only for FOV, pathfinding, and seeded RNG — and only behind adapter interfaces so it never leaks into the architecture and can be swapped out by replacing one file each.

---

## 2. Scope

In scope:

- Hybrid architecture: entities as data (component bags) + composable behavior mixins.
- Energy/speed turn scheduler and an action → effect → event pipeline.
- Map model, tile registry, and a generation suite (BSP, cellular, drunkard's walk, prefab/vault stamping, plus a generator interface for your own).
- Stats (derived scalars) and resources (bounded pools with overflow/threshold events), with combat and status effects built on top.
- Items, inventory, equipment.
- Cross-cutting primitives (§11A): tags, factions/relationships, geometry/targeting, timers/delayed effects, tile/zone triggers, and dice + weighted-table content utilities.
- FOV, pathfinding, AI steering (via rotJS adapters).
- Field-based AI: goal (Dijkstra) maps, scent maps, and influence maps over one data-oriented store; flee/safety derivation, weighted desire-driven monster behavior, autoexplore/auto-travel/hazard-escape (§11.3).
- Seeded RNG with **guaranteed determinism** — all randomness flows through one seeded `RNG` (`pure-rand`) with `fork()` sub-streams and order-stable iteration; reproducibility is a tested invariant, not a hope (§22.13).
- Multi-level **transitions** (descend/ascend, lazily-built linked levels) and a pure **look/examine** query (§24).
- Opt-in **feature modules** layered on the core (combat crits, XP/progression, identification & curses, ranged, hunger, doors) — composed by name, recorded in the save manifest (§23).
- Headless render state + a canvas glyph/tile renderer adapter.
- Input mapping (key/pointer → command) and a command-dispatch registry.
- UI layer: message log, HUD, menu/modal stack.
- **Real-time** play (fixed-timestep driver) and authoritative **co-op multiplayer** (shared-fog or per-player hidden-info), transport-agnostic with a networked WebSocket reference (§25).
- Save/load serialization.

Out of scope (for now):

- Audio.
- A WebGL renderer (canvas2D first; renderer interface leaves room for it later).
- Netcode beyond the reference transport: client-side prediction, frame deltas/compression, matchmaking.

---

## 3. Design pillars

**Headless core.** The simulation never imports rendering or input code. The core produces state and emits events; adapters observe. This is what makes the engine testable in plain Node and what lets you target canvas now and something else later.

**Hybrid data + mixins.** Entities are data: a map of components. Behavior is attached through *mixins* (a.k.a. traits) — small composable units that declare which components they read/write and provide reactions to actions and events. There is no strict ECS system scheduler; logic runs in explicit, ordered pipelines that are easy to read and debug. This matches the architecture you chose: the flexibility of component composition without the indirection of a full ECS.

**Everything-is-an-action.** Every change to the world that a turn-taker can cause is an `Action`. Actions are validated, then produce `Effect`s (atomic state mutations), which emit `Event`s (notifications for UI/AI/log). This single chokepoint is what makes save/load, logging, AI, and animation tractable.

**Config vs. logic separation.** Numbers, costs, colors, glyphs, speeds, damage formulas-as-data, and content tables are *configurable values* surfaced through registries and a config object — not hardcoded in logic. The rules engine reads from config; it does not embed specific values.

**Adapters at the edges.** rotJS, the canvas, the DOM input source, and the storage backend all sit behind interfaces. The core depends on the interfaces, never the implementations.

---

## 4. Architecture overview

Four layers, dependencies point downward only:

```
┌─────────────────────────────────────────────────────────┐
│ presentation:  canvas renderer · input source · UI/HUD   │  observes core, sends commands
├─────────────────────────────────────────────────────────┤
│ game systems:  scheduler · actions · combat · items ·    │  the rules
│                mapgen · AI · status effects · save        │
├─────────────────────────────────────────────────────────┤
│ core model:    Entity · Component registry · World ·      │  pure data + mixins
│                Level · Tile · Event bus · RNG             │
├─────────────────────────────────────────────────────────┤
│ adapters:      rotJS (FOV/path/RNG) · storage · clock     │  swappable edges
└─────────────────────────────────────────────────────────┘
```

The core model and game systems are pure TypeScript with no DOM or rotJS imports. Adapters are injected at construction time.

Two later additions slot into this picture without bending the rule (§23, §25): the opt-in **modules** are pure *game systems* (headless rules composed by name, so they stay DOM/rotJS-free like the rest of that layer), and the co-op **`multiplayer/` server** is an *app layer* that sits **above** game systems and render — it may build per-player frames via `render/`, but nothing in the core depends on it.

**Primitive vs. packaged mechanic.** The dividing line within the headless layers: the engine ships *primitives* a developer builds **with** — the entity/effect/event spine, the timeline, typed-array **layers** + the tile-**flag** registry, **steppers** (per-world-tick bulk updates), **fields** and **cell-network** connectivity, the FOV/pathfinding adapters, and the bump-interaction dispatch — and gameplay is *packaged mechanics* built **on** them. Combat, doors, hunger, ranged, etc. are already opt-in modules; the AI/field *batteries* (goal/scent/influence producers, `DesireAI`, autoexplore) are the same category and are being moved behind that line too. So "airtight", "wire-power", "atmosphere diffusion", and "bump-to-open" are game mechanics expressed through registered flags, network indexes, steppers, and bump rules — never engine-privileged channels.

---
