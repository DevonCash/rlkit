# rlkit

A batteries-included TypeScript roguelike engine — headless core, energy-based turn timeline, an action/effect/event pipeline, stats & resources, items, four map generators, Dijkstra/scent/influence-field AI, triggers & zones, multi-level transitions, a look/examine query, and deterministic save/load. On top of the core it ships opt-in **feature modules** (combat crits, XP/progression, identification & curses, ranged, hunger, doors), a **real-time** driver, and authoritative **co-op multiplayer** (including networked hidden-info). Goes beyond rotJS (which it uses only for FOV and pathfinding) by shipping the systems most roguelikes rewrite every time.

> **Status: implemented (spec rev 10).** Every milestone (§20) plus the post-spec extensions are complete and green — **314 tests across 70 files** over the headless core, the presentation stack, and four playable example apps. The engine is DOM-free; rotJS is confined to two adapters.

## Requirements

- **Node 20+** and **npm**. Modern browser for the demo. No other system dependencies.

## Install, build & test

```sh
npm install        # install runtime + dev dependencies
npm run build      # bundle the library with tsdown (ESM + .d.ts → dist/)
npm test           # run the Vitest suite (314 tests)
npm run typecheck  # tsc --noEmit (strict)
npm run lint       # eslint (enforces the headless import boundaries)
```

## Run the browser demo

The demo is a separate Vite app under [`examples/web`](./examples/web) — the only place that touches the DOM. It runs against the library's live source (HMR, no build step):

```sh
npm install                 # (once, at the repo root — provides rot-js, pure-rand, …)
cd examples/web
npm install                 # the demo's own dev deps (vite, typescript)
npm run dev                 # open the printed URL (default http://localhost:5173)
```

You get a BSP dungeon with a hunting goblin or two. **Controls:** move with vi-keys / arrows / numpad · `i` inventory · `g` pick up · `.` wait. To produce a static build instead, `npm run build` in `examples/web`.

[`examples/web/src/main.ts`](./examples/web/src/main.ts) is the worked reference for wiring the headless engine to a real canvas + keyboard through the structurally-typed adapters.

There are three more example apps, each runnable on its own (`cd` in, `npm install`, then `npm run dev` — `netcoop` also needs `npm run server`):

- [`examples/depths`](./examples/depths) — **The Depths**, a full game: themed multi-level descent, save/load, and all six opt-in modules (combat, progression, identification & curses, ranged, hunger, doors), with an optional real-time mode and a look (`x`) command.
- [`examples/coop`](./examples/coop) — in-process **split-screen co-op**: two local players on one shared real-time world; Tab toggles shared-union vs hidden per-player fog.
- [`examples/netcoop`](./examples/netcoop) — **networked hidden-info co-op**: an authoritative Node WebSocket server ([`GameServer`](./src/multiplayer/server.ts)) ships each client only its own player's rendered frame. `npm test` runs a headless two-client wire round-trip.

## Use it as a library

```ts
import { createWorld, defaultConfig, buildLevel, spawn, perform, encodeSave, loadWorld } from 'rlkit';

const world = createWorld({ config: defaultConfig, rng: 1 }); // seeded → reproducible

// Content is data: register a blueprint, then spawn it.
world.services.registries.blueprints.register('player', {
  id: 'player',
  components: [
    { type: 'renderable', glyph: '@', fg: '#fff', layer: 5 },
    { type: 'stats', base: { 'max-hp': 30 } },
    { type: 'resources', pools: { hp: { current: 30 } } },
  ],
});

const { level, entrance } = buildLevel(world, { generator: 'bsp', width: 60, height: 30 });
const player = spawn(world, 'player', { at: entrance, levelId: level.id });

// One move — the engine decides relocate / swap / attack / bump and drains reactions.
perform(world, { type: 'move', actor: player.id, dir: { x: 1, y: 0 } });

// Deterministic save/load round-trip.
const restored = loadWorld(encodeSave(world));
```

For a driven turn loop, use `takeTurn`/`step`/`run` from the same entry point (the demo's `createSession` wraps them); for real-time, `tickRealtime` (single-player) or `tickRealtimeMulti` / `createGameServer` (co-op). Opt into feature bundles with `createWorld({ ..., modules: [combatModule(), hungerModule(), …] })`. Generators: `'bsp' | 'cellular' | 'drunkard' | 'prefab'`.

## Project layout

```
src/            the engine (published library; DOM-free, rotJS only in adapters/)
  core/         entities, components, registry, world, events, RNG, coords, query, fields, module
  sim/          action pipeline, reactors, timeline, combat, items, AI, triggers, handlers,
                drivers (turn-based + real-time), visibility, transitions, look
  modules/      opt-in feature bundles: combat, progression, identification, ranged, hunger, doors
  mapgen/       MapGenerator + bsp/cellular/drunkard/prefab + decorate (reachability)
  render/ input/ ui/   presentation (observes state; structural DOM seams; command-dispatch registry)
  multiplayer/  transport-agnostic authoritative co-op GameServer (app layer; per-player viewFor)
  adapters/     rotJS FOV + pathfinding, pure-rand RNG, devalue storage
  content/      Zod boundary validation for save blobs
  index.ts      the public API surface
examples/       web · depths · coop · netcoop — four standalone playable apps
docs/           the design spec (the source of truth)
test/           Vitest suite (one snapshot: the determinism golden run)
```

## Design at a glance

- **Hybrid model** — entities are data (components); behavior is composable **mixins**; no ECS system-sweep.
- **One spine** — every change is an `Action → Effect → Event` (validate-all-then-apply); save, replay, AI, triggers, and the message log all fall out of this one mechanism.
- **Two rule primitives** — derived **stats** and bounded **resources**; combat and status effects are thin consumers.
- **Field AI** — goal (Dijkstra), scent, and influence maps over one data-oriented store; monsters are weighted "desires" over fields.
- **Determinism by construction** — seeded RNG everywhere, mutation only through effects, serialize-by-name; reproducible runs and trustworthy saves.

## Learn more

- **[`docs/INDEX.md`](./docs/INDEX.md)** — annotated map of the spec; start here.
- **[`docs/`](./docs/)** — the full design, split into twelve focused documents (the source of truth).
- **[`CLAUDE.md`](./CLAUDE.md)** — conventions and the non-negotiable architecture rules.

Naming: `rlkit` is a working title and a configurable value — rename freely.
