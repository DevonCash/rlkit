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
    world.ts           # World = { state, services }; ReadonlyWorld view; fork() seam; TimelineState + Timeline interface (peekNextDue/advanceClock); LevelProvider/LevelLink seam (§24)
    module.ts          # Module interface + orderModules/composeModules/assertModulesPresent (§23)
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
    timeline.ts        # unified timeline impl (actor turns + one-shot delayed effects); two clocks; peekNextDue/advanceClock for real-time pacing (Timeline interface + TimelineState live in core/world.ts)
    driver.ts          # the driver family: takeTurn/step (turn-based) + tickRealtime/tickRealtimeMulti (real-time, §25)
    action.ts          # resolve() (validate-all-then-apply) + perform() (drives reaction loop); spine types declared in core/action.ts and re-exported here
    reactors.ts        # entity (mixin) + global reactor gathering: runPreReactors / collectReactions
    visibility.ts      # FOV into shared (computeVisibility/Union) or per-player (computeVisibilityFor, visible:<id>/explored:<id>) layers (§25)
    transition.ts      # transitionEffect (sole writer for level changes) + descend/ascend handlers (§24)
    look.ts            # describeCell — pure look/examine query over a tile's entities (§24)
    handlers/          # move, wait, bump (M2); attack, pickup, equip, useItem, throwItem, descend/ascend, openClose, ...
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
  modules/             # opt-in feature bundles — pure game rules, composed by name (§23)
    combat.ts          # hit/miss rolls, crits, kill attribution (lastAttackerOf)
    progression.ts     # XP, levels, stat gains, refill (Experience component)
    identification.ts  # identify / curses (Identity component, displayName)
    ranged.ts          # ranged attacks + aiRangedMixin
    hunger.ts          # satiation clock → starvation damage
    doors.ts           # openable doors (movement + FOV gating)
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
    frame.ts           # buildFrame(world, viewport, camera, opts?) — opts.visibleLayer/exploredLayer select a per-player FOV (§25); viewport, camera
    ascii-renderer.ts canvas-renderer.ts
  input/
    input.ts keymap.ts pointer.ts command-to-action.ts
  ui/
    stack.ts hud.ts log.ts log-view.ts composite.ts modals/
    session.ts         # Session controller (drives the loop, renders)
    commands.ts        # command-dispatch registry: CommandTable/CommandHandler/CommandCtx (§24)
  multiplayer/
    server.ts          # createGameServer — authoritative co-op host: join/leave/enqueue/tick/viewFor/snapshot; shared|hidden fog (§25)
  config/
    defaults.ts        # all default configurable values in one place
  index.ts             # public API surface
examples/              # web · depths · coop · netcoop — standalone Vite/Node apps (not part of the library)
test/                  # vitest, pure-core tests need no DOM
```

Dependency rule (enforced by lint/import boundaries): `core` ← `sim`/`mapgen`/`modules` ← `render`/`input`/`ui` ← `multiplayer`; `adapters` are leaves injected at the top. No cycles. `core`, `sim`, `mapgen`, and `modules` import neither rotJS nor DOM (the opt-in `modules/` are pure game rules). `multiplayer/` is the one app-layer module that may import `render/` (to build per-player frames); nothing in the headless core depends on it.

---

## 18. Public API sketch

Top-level helpers are free functions over the `World`, not methods on it (the `World` stays a plain `{ state, services }` value). The minimal headless path:

```ts
import { createWorld, defaultConfig, buildLevel, spawn, perform, encodeSave, loadWorld } from 'rlkit';

const world = createWorld({ config: defaultConfig, rng: 1 });   // seed → reproducible

world.services.registries.blueprints.register('player', { id: 'player', components: [/* … */] });
const { level, entrance } = buildLevel(world, { generator: 'bsp', width: 80, height: 40 });
const player = spawn(world, 'player', { at: entrance, levelId: level.id });

perform(world, { type: 'move', actor: player.id, dir: { x: 1, y: 0 } });   // validate → effects → events
const restored = loadWorld(encodeSave(world));                              // deterministic round-trip
```

Opt into feature bundles at construction (composed by name, recorded in the save manifest, §23):

```ts
import { createWorld, combatModule, hungerModule, doorsModule } from 'rlkit';
const world = createWorld({ config: defaultConfig, rng: 1, modules: [combatModule({ critChance: 0.05 }), hungerModule(), doorsModule()] });
```

Drive turns with `takeTurn`/`step` (turn-based) or, for a presented game, `createSession` (wraps the loop + a `CommandTable`, §24). Real-time and multiplayer reuse the same world:

```ts
import { tickRealtime, createGameServer } from 'rlkit';

tickRealtime(world, { player: player.id, action: buffered, ticks: 4 });    // single-player real-time (§25)

const server = createGameServer({ world, spawnPlayer, fog: 'hidden' });    // authoritative co-op (§25)
const a = server.join();
server.enqueue(a, { type: 'move', actor: a, dir: { x: 1, y: 0 } });
server.tick(2);
const view = server.viewFor(a, { width: 40, height: 24 });                 // per-player frame; unseen entities absent
```

Everything above the core is opt-in: a headless test can `createWorld`, spawn, `resolve`/`perform` actions, and assert on events without a renderer, input, modules, or a server. The presentation classes (`AsciiRenderer`/`CanvasRenderer`, `KeyboardInput`/`PointerInput`, the UI stack) are imported the same way when a real frontend is wired — see `examples/web`.

---

## 19. Build & tooling

- **Language/output**: TypeScript, strict mode; emit ESM; ship `.d.ts`. Target modern browsers; no Node-only APIs in core.
- **Bundler**: **tsdown** (Rolldown-powered, ESM-first, built for libraries). Fallback to tsup if it bites — a swap of an afternoon.
- **Tests**: **Vitest + `@fast-check/vitest`**. Core/sim/mapgen are pure and unit-tested without a DOM; render/input get light jsdom or canvas-mock coverage. Tests encode intended behavior of the rules (per your testing principle), e.g. "an attack against a defended target applies the configured damage formula," not snapshots of current numbers. Property tests cover the invariants: every seed yields a fully-reachable map, HP never goes negative, `load(save(w))` round-trips, no actor is starved by the timeline. Deterministic RNG means any fast-check failure reproduces from its seed. The full per-system test-target list is §22.
- **Lint**: ESLint with an import-boundary rule to enforce §17 layering (core/sim import neither rotJS nor DOM).
- **Runtime deps** (small and pure): `rot-js` (FOV + pathfinding adapters only), `pure-rand` (RNG), `ts-pattern` (dispatch), `devalue` (save encoding), `zod`/`zod/mini` (boundary validation). Presentation-only/optional: `pixi.js` (alternate renderer). Everything else is dev-only. The opt-in `modules/` and the `multiplayer/` `GameServer` add **no** runtime dependencies — they're built from the same primitives. The networked `examples/netcoop` brings its own deps (`ws`, `tsx`, `vite`) in its own `package.json`; the library itself ships no transport.

---
