# Extensions — Modules, Transitions, Real-time & Multiplayer

> Part of the **rlkit** engine spec — sections §23–25. The systems added after the original milestones (§20.1–11) shipped. Every one is **additive and backward-compatible**: defaults reproduce the prior single-player, turn-based behavior, so the whole suite stays green. None of them changed the core model — they fall out of the same timeline, effects, and registries.
>
> See also: 01-core-model (the model these build on) · 02-simulation (timeline + effects) · 09-reference (where each file lives). Full map and reading order: [INDEX.md](./INDEX.md).

---

## 23. Modules — opt-in feature bundles

The core ships the *mechanisms* (stats, resources, effects, reactors, the timeline); a **module** is a named bundle of content and reactors that turns a mechanism into a *feature*. Rather than define a game as one interdependent application, a game is `createWorld({ modules: [...] })` — a list of bundles composed by name. This keeps the base engine small and lets a game opt into exactly the rules it wants.

### 23.1 The `Module` interface

```ts
interface Module {
  id: string;
  dependencies?: string[];          // ids that must compose before this one
  setup(world: World): void;        // register components/effects/reactors/blueprints
}
```

A module's `setup` only *registers* — it adds to the world's registries and reactor sets. It must stay **headless** (no rendering/input/DOM/rotJS imports), exactly like `sim/`: modules are game rules, not presentation.

Three helpers manage a module set (`core/module.ts`):

- **`orderModules(modules)`** — topological sort by `dependencies`; throws a clear error on a cycle or a missing dependency. Order is otherwise stable (declaration order), so composition is deterministic.
- **`composeModules(world, modules)`** — order, then run each `setup` once, then record the resulting id list in **`WorldState.modules`** (the manifest). `createWorld({ modules })` calls this.
- **`assertModulesPresent(required, provided)`** — load-time guard: a save carrying a manifest of modules it depends on can refuse to load into a world that didn't compose them, instead of failing mysteriously later. `loadWorld({ modules })` re-composes the same set and checks the manifest.

The manifest is the only new persisted state: modules serialize *by name* like everything else (§6.3). Their effects and reactors are reconstructed by re-running `setup` on load — never serialized as closures.

### 23.2 The six base modules

All are factory functions returning a `Module`; pass options to tune the (configurable) numbers. They are the batteries-included answer to the four "common roguelike" gap clusters (identification/curses, ranged, progression, hunger+doors+crits).

| Factory | id | Adds | Key options / exports |
|---|---|---|---|
| `combatModule(opts?)` | `combat` | Hit/miss rolls and **critical hits** on the existing damage path; kill attribution. | `CombatOptions` (crit chance/multiplier, to-hit); `lastAttackerOf(world, id)`. |
| `progressionModule(opts)` | `progression` | **XP & levels**: a kill awards XP; crossing the curve levels the actor up, raising stats and refilling pools. | `ProgressionOptions` (xp curve, per-level gains); `Experience` component. |
| `identificationModule()` | `identification` | **Identification & curses**: items start unidentified; cursed equipment can't be removed until uncursed. | `Identity` component; `displayName(world, item)` for the shown name. |
| `rangedModule(opts?)` | `ranged` | **Ranged attacks** honoring LoS/range; an AI that kites and fires. | `RangedOptions` (range, falloff); `aiRangedMixin`. |
| `hungerModule(opts?)` | `hunger` | A **satiation** resource that drains on the per-actor clock; reaching zero starts starvation damage. | `HungerOptions` (drain rate, starvation damage). |
| `doorsModule()` | `doors` | **Doors**: an `openClose` interaction; a closed door blocks movement and FOV until opened. | — |

```ts
import { createWorld, defaultConfig, combatModule, progressionModule, hungerModule, doorsModule } from 'rlkit';

const world = createWorld({
  config: defaultConfig,
  rng: 1,
  modules: [combatModule({ critChance: 0.05 }), progressionModule({ curve, gains }), hungerModule(), doorsModule()],
});
// world.state.modules === ['combat', 'progression', 'hunger', 'doors']  (the save manifest)
```

The Depths game ([`examples/depths`](../examples/depths)) composes all six and is the worked reference. Authoring a new module means writing one `setup` that registers against the same registries — no engine change.

---

## 24. Level transitions, look/info & the command registry

### 24.1 Multi-level transitions

A dungeon is many `Level`s; moving between them is one effect, so it can't half-apply or desync the timeline.

- The **`stairs` component** `{ dir: 'up' | 'down', to?: { levelId, cell } }` marks a transition tile's entity. `to` is the link; it may start unset.
- **`descendHandler` / `ascendHandler`** are the `descend`/`ascend` action handlers (§7.4). They find the stair under the actor, resolve its destination, and emit a single transition.
- **`transitionEffect(actorId, stairsId)`** is the *sole writer* for level changes. It relocates the actor's `position`, re-indexes it in the spatial query layer, and **swaps timeline membership by level** — actors not on the destination level are frozen (removed from scheduling) and the destination's actors activated — then emits `entity:changed-level`. Validate-all-then-apply still holds: the move either happens completely or not at all.
- **`services.levelProvider?`** is the optional game hook for lazy worlds: `(world, req: LevelRequest) => LevelLink | undefined`, where `LevelRequest = { depth, dir, from }`. The first time an actor uses an *unlinked* stair, the provider builds (and caches the link to) the destination level; subsequent uses reuse the link. A game that pre-builds every level just omits the provider and sets `to` up front.

Because levels and pending timeline state are ordinary serializable `WorldState`, a save taken mid-descent round-trips exactly (§22.15).

### 24.2 Look / examine

- The **`info` component** `{ name, description? }` is authored display metadata — the human name of an entity and an optional blurb.
- **`describeCell(world, levelId, cell): CellDescription`** is a pure query (no turn cost, no mutation): it returns the tile type, whether the cell is visible, and **every entity on the cell, topmost-first** (`{ id, name, description?, glyph?, fg?, layer }[]`). A game binds this to a look command (the Depths demo uses `x`) and renders the result in-band.
- A **message-log resolver hook** lets the log substitute an entity's authored `name` into event templates, so "the Player hits the Goblin" reads from content, not ids — and undiscovered actors can be suppressed from the log.

### 24.3 Command-dispatch registry

The Session gains a small routing layer so a game maps a `Command` to behavior without forking the driver loop:

```ts
type CommandHandler = (cmd: Command, ctx: CommandCtx) => void;
type CommandTable   = Record<string, CommandHandler>;
interface CommandCtx { world: World; player: EntityId; submit(a: Action): void; pushModal(m: Modal): void; dispatch(c: Command): void; render(): void; }
```

`createSession({ commands })` merges a game's table over the defaults. A handler can `submit` an action (feed the driver and re-render), `pushModal` (inventory/targeting), or `dispatch` to re-enter routing. The default table covers movement, pickup, wait, etc.; a game adds look, throw, descend, and the like by name.

---

## 25. Real-time & multiplayer

The timeline is a continuous-time scheduler that already orders actors deterministically by id, so real-time and co-op needed **no change to the deterministic core** — only new drivers over the same timeline, and a way to render per player.

### 25.1 Timeline pacing hooks

Two additions to the `Timeline` interface let a driver pace wall-clock against game-time without processing turns it isn't ready for:

- **`peekNextDue(): number`** — the world tick at which the soonest actor or timer fires (`Infinity` if idle).
- **`advanceClock(delta): void`** — advance the world clock and accrue energy to all actors *without* processing entries.

### 25.2 The driver family (`sim/driver.ts`)

| Driver | Shape | Blocks on input? | Use |
|---|---|---|---|
| `takeTurn` / `step` | one entry / until-player | yes (awaits a command) | turn-based single-player (§6) |
| `tickRealtime` | `{ player, action?, ticks }` | **no** (consumes a buffered action or waits) | real-time single-player |
| `tickRealtimeMulti` | `{ players, actionFor, ticks, updateFog? }` | **no** | real-time co-op (a set of player actors + AI) |

`tickRealtime*` advance a fixed number of *logical* ticks per call; the host calls them on a fixed timestep (e.g. `examples/coop`/`netcoop` run ~16 ms/tick). A player whose turn comes up consumes its buffered action, else it `wait`s; every other actor runs `decideAction` (identical AI to single-player). Two identical tick/input streams under one seed produce identical worlds — determinism is preserved by construction.

### 25.3 Visibility: shared vs hidden-info

Co-op needs a fog policy (§11.1 lists the three FOV functions):

- **Shared** — `computeVisibilityUnion` writes the union of all players' FOV into the shared `visible`/`explored` layers; everyone sees the same map. `tickRealtimeMulti` does this by default (`updateFog`).
- **Hidden-info** — `computeVisibilityFor(world, id)` writes a player's FOV into **private** `visible:<id>`/`explored:<id>` layers. `buildFrame(..., { visibleLayer: visibleLayerFor(id), exploredLayer: exploredLayerFor(id) })` then renders only that player's view, so an entity the viewer can't see is **absent** from the frame — the frame itself is the anti-cheat boundary (§13.1).

### 25.4 The authoritative co-op server (`multiplayer/server.ts`)

`createGameServer` is a headless, **transport-agnostic** host: it owns one `World`, accepts joins and buffered intents, advances a real-time tick, and renders per player. It is the one *app-layer* module — it may import `render/` to build frames — and nothing in the core depends on it.

```ts
interface GameServer<E = unknown> {
  readonly world: World;
  readonly players: ReadonlySet<EntityId>;
  join(): EntityId;                              // spawn a player; seeds its FOV in hidden mode
  leave(id: EntityId): void;                     // despawn + drop its private visibility layers
  enqueue(id: EntityId, action: Action): void;   // buffer the player's next action
  tick(ticks: number): ServerUpdate;             // advance the shared world
  viewFor(id: EntityId, viewport: Viewport): PlayerView<E>; // the per-player payload a transport sends
  canViewerSee(id: EntityId, cell: Cell): boolean;          // per-player visual (LoS) perception
  snapshot(): string;                            // encoded state for (re)join
}
interface PlayerView<E = unknown> { frame: RenderFrame; hp?: { current: number; max: number }; alive: boolean; extra?: E }
interface ServerUpdate { worldClock: number; acted: EntityId[]; idle: boolean; events: GameEvent[] }
```

`GameServerOptions.fog` is `'shared'` (default) or `'hidden'`. In hidden mode the server recomputes FOV only for the players who moved this tick (joins are seeded on connect) and skips the unused union; `viewFor` renders through that player's private layers, so the wire payload leaks nothing. A transport just pipes messages to `join`/`enqueue`/`leave` and calls `tick` on a clock — a Cloudflare Durable Object would wrap the same calls.

**Events out + per-player perception (R4).** `tick()` returns the ordered `GameEvent`s that tick produced (`ServerUpdate.events`, captured via the bus's `onAny` tap) so the transport can fan them out. Under hidden fog, filter per player: `canViewerSee(id, cell)` is the per-viewer visual (line-of-sight) predicate — the game maps each event to the cell(s) where it's perceivable (not all events are cell-keyed) and adds its own **hearing**-radius checks (distance, game-side; chat stays app-layer). A dead/ghost viewer composes as all-seeing game-side.

**Game-defined HUD payload (R6).** `GameServerOptions.viewExtra(world, playerId) => E` builds a per-player extension (O₂, role, round clock, held item) carried on `PlayerView<E>.extra`; `GameServer<E>` threads the type. Contract: `viewExtra` reads only the viewer's own state, so hidden fog doesn't leak another player's extras.

**Real-time calibration.** Stepper/atmosphere cadences are in **world-ticks** (energy units), and world-ticks-per-wall-second is *your* loop's fixed timestep when it calls `tick(ticks)` — coupled to the action economy (`baseActionCost ÷ speed` world-ticks per actor action). A recurring stepper fires once per cadence boundary even across a multi-tick jump (cadence is wall-clock-chunk-independent). Two tick surfaces, both in world-tick units: global **steppers** (environmental rates) and per-actor **status ticks** (per-breather rates).

### 25.5 Networked reference (`examples/netcoop`)

The reference transport is a small Node `ws` server: on connect it `join`s and sends a welcome; client messages run through a small **decoder map** (`msg.type → decode`) where each branch sanitizes its own payload into a typed `Action` (an authoritative server never trusts client input — no speed-hack, no `NaN`) before `enqueue` — `move` and `useOn` ship as the two reference branches, and a game adds variants by adding a branch. On a fixed-timestep loop it `tick`s and broadcasts each socket only its own `viewFor` frame (skipping unchanged frames), with a localhost origin check. A headless two-client round-trip (`npm test` in the example) proves each client receives a *distinct* per-player frame over the wire and that malformed input can't corrupt the world.

Deferred (not built): client-side prediction (`world.fork()`), frame deltas/compression, per-player log filtering, and a Durable Object adapter — all of which slot onto the same `GameServer`/`viewFor` seam without touching the engine.

---
