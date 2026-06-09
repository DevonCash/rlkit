# CLAUDE.md — rlkit

Instructions for working on **rlkit**, a batteries-included TypeScript roguelike engine. The full design lives in [`docs/`](./docs/INDEX.md) and is the source of truth — read [`docs/INDEX.md`](./docs/INDEX.md) first.

## Status & where to start

**Implemented (spec rev 11).** All milestones in `docs/10-roadmap-and-tests.md` (§20) are built and green — the full test suite passes. The headless core, presentation stack, save/load, the post-spec extensions (opt-in **modules**, level **transitions**, **look/info**, the **real-time** driver, and **co-op multiplayer**), and the **engine-requirements batch-1** primitives (tile-flag registry + composed flags layer, the `setTile` effect, per-world-tick **steppers**, **cell-network** connectivity, events-out + per-viewer perception, the real `ActionMap`/`EventMap` merge seam, **bump-interaction** dispatch, and the generic per-player view payload) all exist. `npm run build`, `npm test`, `npm run typecheck`, and `npm run lint` all pass.

Before changing anything, read [`docs/INDEX.md`](./docs/INDEX.md) for the map. The spec is the source of truth: when code and spec disagree, fix the code, or — if the intent genuinely changed — update the relevant `docs/` file in the same change. New systems land with their test targets from §22.

The four playable examples (each its own Vite/Node app) are the worked references: `examples/web` (single-player), `examples/depths` (full game using all six modules), `examples/coop` (in-process split-screen co-op), `examples/netcoop` (networked hidden-info co-op over WebSocket).

## Architecture rules (do not violate)

These are the invariants the whole design depends on. Breaking one quietly breaks save/load, determinism, or testability.

- **Headless core.** `core/`, `sim/`, `mapgen/`, the field code, and the opt-in `modules/` (which are pure game rules) must not import rendering, input, the DOM, or rotJS. rotJS is allowed **only** inside `adapters/` (FOV + pathfinding). The simulation emits state and events; presentation observes. (`multiplayer/` is an **app layer** above sim+render — it may import `render/` to build per-player frames — not part of the headless core.)
- **Mutation goes through effects only.** Effects are the sole writers of world state; everything upstream gets a `ReadonlyWorld`. Multi-effect actions **validate all, then apply** — never half-apply.
- **Serialize by name, never closures.** State stores registry ids (mixin names, `effectId`, `testId`, component `type` tags), never functions. One generic `Registry<T>` backs this (§6.3).
- **`World = state + services`.** Only `WorldState` serializes; `Services` are reconstructed from registries on load. Don't put non-serializable handles in state.
- **All randomness through the seeded RNG.** Use the injected `RNG` (pure-rand) everywhere — never `Math.random`. Fork sub-streams for independent concerns. Iteration over entities/effects/subscribers must be order-stable.
- **Schema-first for persisted/authored types.** Components, blueprints, tile types, and the save blob are defined as Zod schemas with `z.infer`'d types (one declaration). Runtime-only types (`Action`, `GameEvent`, `RenderFrame`) stay plain interfaces. Never declare a type twice.
- **Packed-integer coordinates.** `Cell = y*width+x` is canonical; `Point {x,y}` only at API edges; `"x,y"` strings only for debug.
- **Config vs logic.** Numbers, costs, colors, glyphs, speeds, rates, falloffs, and content tables are configurable values surfaced through config/registries — not hardcoded in rules. Algorithms are logic.
- **Reactions don't recurse.** Events drain through the reaction loop (FIFO + depth guard); mixins/triggers/systems are reactors keyed by `(eventType, scope, phase)`. `onAction` = cancelable pre-phase; `onEvent` = post-phase.

## Tooling

- Language: TypeScript, `strict`, ESM output, ship `.d.ts`. Modern browsers; no Node-only APIs in the core.
- Build: **tsdown** (tsup is a sanctioned fallback, not currently a dependency). Tests: **Vitest** + **@fast-check/vitest**.
- Runtime deps (keep small, all pure): `rot-js` (FOV + pathfinding adapters only), `pure-rand` (RNG), `ts-pattern` (Action/Event dispatch), `devalue` (save encoding), `zod` (boundary validation; the `zod/mini` entry point is sanctioned for hot paths but not currently used). Optional presentation-only: `pixi.js` (sanctioned but not currently a dependency).
- Lint: an import-boundary rule enforcing the layering above (core/sim import neither rotJS nor the DOM).

## Testing

Tests are a **record of intended behavior**, not a snapshot of current code. A failing test means either a real regression (fix the code) or a deliberate change in intended behavior (update the test to the new intent) — never silence a failure to make it pass.

- Test through public behavior (resolve actions, assert events/state); don't reach into internals. The headless core needs no mocks or DOM.
- Prefer property tests (`fast-check`) for invariants — deterministic RNG makes every failure reproduce from its seed.
- The **only** snapshot in the suite is the determinism golden-run (§22.13). Everything else asserts behavior.
- Full per-system targets: `docs/10-roadmap-and-tests.md` (§22).

## Conventions

- Git commits: **no co-author lines / trailers.** Keep messages focused.
- Prefer extracting reusable components over one-off solutions; integrate with existing primitives rather than adding parallel ones.
- When the code and the spec disagree, the spec is intended behavior — fix the code or, if the intent genuinely changed, update the relevant `docs/` file in the same change so the spec stays the source of truth.
