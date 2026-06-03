# rlkit

A batteries-included TypeScript roguelike engine — headless core, energy-based turn timeline, an action/effect/event pipeline, stats & resources, items, map generation, Dijkstra/scent/influence-field AI, and save/load. Goes beyond rotJS (which it uses only for FOV and pathfinding) by shipping the systems most roguelikes rewrite every time.

> **Status: design complete (rev 9), pre-code.** No source yet — the design is fully specified and ready to build.

## Where things are

- **[`docs/INDEX.md`](./docs/INDEX.md)** — the annotated map of the spec. Start here.
- **[`docs/`](./docs/)** — the design spec, split into eleven focused documents.
- **[`CLAUDE.md`](./CLAUDE.md)** — conventions, architecture rules, and the start-here pointer for building it (read this before writing code).

## Getting started (building it)

1. Read [`docs/INDEX.md`](./docs/INDEX.md), then `docs/00-overview.md` → `01` → `02`.
2. Read [`CLAUDE.md`](./CLAUDE.md) for the non-negotiable architecture rules.
3. Scaffold the project per `docs/09-reference.md` (§19), then start **milestone 1** in `docs/10-roadmap-and-tests.md` (§20).

## Design at a glance

- **Hybrid model** — entities are data (components); behavior is composable **mixins**; no ECS system-sweep.
- **One spine** — every change is an `Action → Effect → Event`; this is what makes save, replay, AI, and the message log fall out of one mechanism.
- **Two rule primitives** — derived **stats** and bounded **resources**; combat and status effects are thin consumers.
- **Field AI** — goal (Dijkstra), scent, and influence maps over one data-oriented store; monsters are weighted "desires" over fields.
- **Determinism by construction** — seeded RNG everywhere, mutation only through effects, serialize-by-name; reproducible runs and trustworthy saves.

Naming: `rlkit` is a working title and a configurable value — rename freely.
