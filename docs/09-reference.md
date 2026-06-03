# Reference — Module Map, Public API & Tooling

> Part of the **rlkit** engine spec — sections §17–19. The src/ module map, the public API sketch, and the build/test tooling choices.
>
> See also: 10-roadmap-and-tests · 00-overview. Full map and reading order: [INDEX.md](./INDEX.md).

---

## 17. Project structure (module map)

```
src/
  core/
    entity.ts          # Entity, component accessors
    component.ts       # Component base + registry
    mixin.ts           # Mixin interface (onAction/onEvent/modifyStats/takeTurn) + registry + resolution
    fov.ts             # FovProvider interface (rotJS impl injected from adapters/) — §11.1
    path.ts            # PathProvider interface (rotJS impl injected from adapters/) — §11.1
    fields.ts          # Field abstraction types + FieldStore/FieldManager interfaces (impl in sim/ai) — §11.3
    world.ts           # World = { state, services }; ReadonlyWorld view; fork() seam; TimelineState + Timeline interface
    registry.ts        # generic Registry<T> + Registries bag (§6.3)
    query.ts           # entity query/index layer (per-component/mixin id sets)
    coords.ts          # Cell (packed int) + Point helpers (cellOf/pointOf, neighbor offsets)
    level.ts           # Level as a layered grid (typed cell layers over one Cell space)
    action.ts          # Action/Effect/ActionContext/ActionOutcome type declarations (no logic — lives in core so Mixin/Reactor can reference ActionContext)
    events.ts          # EventBus + createReactionLoop (FIFO, depth guard; resolver-parameterized so core never imports sim); typed GameEvent
    reactor.ts         # Reactor model: (action/event type, scope, phase) registration + dispatch
    rng.ts             # RNG interface + default (pure-rand-backed), fork/state
    tags.ts            # Tagged component + per-level TagIndex
    geometry.ts        # line, hasLoS, cellsIn (shapes/targeting)
    dice.ts            # roll() — dice expressions over RNG
    weighted.ts        # WeightedTable pick() over RNG
  sim/
    timeline.ts        # unified timeline impl (actor turns + one-shot delayed effects); two clocks (Timeline interface + TimelineState live in core/world.ts)
    action.ts          # resolve() (validate-all-then-apply) + perform() (drives reaction loop); spine types declared in core/action.ts and re-exported here
    reactors.ts        # entity (mixin) + global reactor gathering: runPreReactors / collectReactions
    handlers/          # move, wait, bump (M2); attack, pickup, equip, useItem, ... (later)
    stats.ts           # stat registry + modifier phase pipeline (deriveStats)
    resources.ts       # resource registry + changeResource (clamp, thresholds, overflow events)
    combat.ts          # damage formula (reads stats, applies hp delta)
    status.ts          # status effects (stat modifiers + per-tick resource deltas) + ticking
    factions.ts        # Allegiance + faction table + stanceBetween
    triggers.ts        # zones + place-scoped reactors (cell/zone triggers); delayed effects via timeline
    items.ts           # inventory/equipment helpers
    ai/                # ai mixins + steering helpers
      field.ts         # Field types, FieldStore (SoA grids, composites, bestStep)
      producers/       # goal (BFS + flee), scent (decay/diffuse), influence (falloff)
      desire-ai.ts     # DesireAI mixin (weighted desires over fields)
      autoexplore.ts   # autoexplore / auto-travel / hazard-escape utilities
  mapgen/
    generator.ts       # MapGenerator interface, LevelBuilder
    bsp.ts cellular.ts drunkard.ts prefab.ts
    decorate.ts        # stairs, spawn tables, reachability
  adapters/
    rot-fov.ts rot-path.ts             # rotJS wrappers (FOV + pathfinding only)
    rng.ts             # pure-rand-backed RNG implementation
    storage.ts         # memory + localStorage + indexeddb (devalue-encoded)
  content/
    validate.ts        # Zod schemas + parse helpers for blueprints & save blobs
  render/
    frame.ts           # buildFrame, viewport, camera
    canvas-renderer.ts
  input/
    input.ts keymap.ts pointer.ts
  ui/
    stack.ts hud.ts log.ts modals/
  config/
    defaults.ts        # all default configurable values in one place
  index.ts             # public API surface
test/                  # vitest, pure-core tests need no DOM
```

Dependency rule (enforced by lint/import boundaries): `core` ← `sim`/`mapgen` ← `render`/`input`/`ui`; `adapters` are leaves injected at the top. No cycles. `core` and `sim` import neither rotJS nor DOM.

---

## 18. Public API sketch

```ts
import { createWorld, CanvasRenderer, KeyboardInput, defaultConfig } from 'rlkit';

const world = createWorld({
  config: defaultConfig,
  rng: undefined,            // defaults to pure-rand-backed; pass a seed for reproducible runs
  registries: { /* register your blueprints, tiles, effects, generators here */ },
});

const level = world.buildLevel({ generator: 'bsp', width: 80, height: 40, depth: 1 });
const player = world.spawn('player', { at: level.entrance });

const renderer = new CanvasRenderer(canvasEl, { tileSize: 16, font: 'monospace' });
const input = new KeyboardInput(window, defaultConfig.keymap);

const game = world.run({ player, renderer, input });  // drives the timeline loop
```

Everything above the core is opt-in: a headless test can `createWorld`, spawn, `resolve` actions, and assert on events without a renderer or input.

---

## 19. Build & tooling

- **Language/output**: TypeScript, strict mode; emit ESM; ship `.d.ts`. Target modern browsers; no Node-only APIs in core.
- **Bundler**: **tsdown** (Rolldown-powered, ESM-first, built for libraries). Fallback to tsup if it bites — a swap of an afternoon.
- **Tests**: **Vitest + `@fast-check/vitest`**. Core/sim/mapgen are pure and unit-tested without a DOM; render/input get light jsdom or canvas-mock coverage. Tests encode intended behavior of the rules (per your testing principle), e.g. "an attack against a defended target applies the configured damage formula," not snapshots of current numbers. Property tests cover the invariants: every seed yields a fully-reachable map, HP never goes negative, `load(save(w))` round-trips, no actor is starved by the timeline. Deterministic RNG means any fast-check failure reproduces from its seed. The full per-system test-target list is §22.
- **Lint**: ESLint with an import-boundary rule to enforce §17 layering (core/sim import neither rotJS nor DOM).
- **Runtime deps** (small and pure): `rot-js` (FOV + pathfinding adapters only), `pure-rand` (RNG), `ts-pattern` (dispatch), `devalue` (save encoding), `zod`/`zod/mini` (boundary validation). Presentation-only/optional: `pixi.js` (alternate renderer). Everything else is dev-only.

---
