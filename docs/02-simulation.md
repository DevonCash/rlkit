# Simulation — Timeline, Actions, Effects, Events & Reactors

> Part of the **rlkit** engine spec — sections §7. The action→effect→event pipeline, the unified timeline, the reactor model (pre/post phases), the reaction loop, and the two clocks.
>
> See also: 01-core-model · 05-ai-and-fields. Full map and reading order: [INDEX.md](./INDEX.md).

---

## 7. Timeline + action/energy system

### 7.1 Timeline (scheduler + delayed effects, unified)

"Take a turn at time T" and "run an effect at time T" are the same thing, so one **timeline** holds both — actor turns as recurring entries and delayed effects (§11A.4) as one-shot entries, ordered by fire time. This replaces having a separate scheduler and timer queue.

```ts
type Entry =
  | { kind: 'actor'; id: EntityId }
  | { kind: 'effect'; effectId: string; payload?: unknown };   // serialize-by-name (§6.3)

interface Timeline {
  addActor(id: EntityId, initialEnergy?: number): void;
  remove(id: EntityId): void;
  schedule(delay: number, effectId: string, payload?: unknown): TimerId;  // one-shot
  next(): Entry;                     // the next entry due
  reschedule(id: EntityId, cost: number): void;   // actor acted; re-queue by cost
}
```

Energy model (logic): each actor accumulates `speed` energy per world tick and may act when energy ≥ 0; actions subtract their `cost`. `EngineConfig.baseActionCost` (e.g. 100) and per-actor `speed` are configurable. The driver loop (§6) pulls `next()`: an `actor` entry yields a turn (player input or AI), an `effect` entry fires through the normal effect→event path. `TimelineState` (the entries) is serializable; the `Timeline` service operates on it.

### 7.2 Actions, effects, events

This is the spine of the engine.

```ts
// Actions are a typed discriminated union — one variant per type, no index signature.
type Action =
  | { type: 'move';    actor: EntityId; dir: Point }
  | { type: 'attack';  actor: EntityId; target: EntityId }
  | { type: 'useItem'; actor: EntityId; item: EntityId; target?: Cell }
  | { type: 'wait';    actor: EntityId }
  /* ...core variants... */;

// Events likewise carry typed payloads per variant.
type GameEvent =
  | { type: 'moved';   entity: EntityId; from: Cell; to: Cell }
  | { type: 'bumped';  entity: EntityId; cell: Cell; target?: EntityId } // a blocked move: wall (no target) or creature
  | { type: 'damaged'; entity: EntityId; amount: number; source?: EntityId }
  | { type: 'died';    entity: EntityId }
  | { type: 'resource:overflow';  entity: EntityId; resourceId: string; excess: number; cause: string }
  /* ...core variants... */;

interface ActionContext {
  world: ReadonlyWorld;       // read-only view — only Effects may mutate
  action: Action;
  push(effect: Effect): void; // queue an atomic mutation
  reject(reason: string): void;   // INVALID: no time passes, re-prompt the player
  fizzle(reason: string): void;   // FAILED: queued effects still apply, the turn is spent
  // Re-dispatch this turn as another action (e.g. `move` → `attack`); optional
  // `announce` events are prepended to the redirected outcome (e.g. `bumped`).
  redirect(action: Action, announce?: GameEvent[]): void;
  cost: number;               // energy; mixins may adjust
}

interface Effect {
  validate(world: ReadonlyWorld): boolean;   // all effects validated before ANY apply
  apply(world: World): GameEvent[];          // the ONLY place the world is mutated
}

type ActionOutcome =
  | { status: 'done';     cost: number; events: GameEvent[] }
  | { status: 'rejected'; reason: string }                       // free; re-prompt
  | { status: 'fizzled';  cost: number; reason: string; events: GameEvent[] };
```

Content extends the unions through the declaration-merged `ActionMap`/`EventMap` interfaces (exported from the package entry): an external consumer writes `declare module 'rlkit' { interface ActionMap { useOn: { type: 'useOn'; actor: EntityId; … } } }` and the typed variant joins the `Action` union with no `any` and no engine patch (empty by default → `ActionMap[keyof ActionMap]` is `never`, a no-op). Engine-internal match sites stay exhaustive over the core variants and fall through to a catch-all for content types; the open-tail `{ type: string; … }` remains for untyped content. The dispatch is registry-keyed, so an unknown action type rejects (never throws).

`resolve(action)` pipeline:

1. Look up the **action handler** (registry: action type → handler). The handler checks preconditions and `push`es `Effect`s onto the context, or `reject`s (invalid → no time passes) / `fizzle`s (failed → turn spent).
2. Fire **pre-phase reactors** (§7.3) — entity mixins' `onAction`, plus any place/global pre-reactors — against the mutable context (e.g. an item's `Cursed` mixin can `reject`, an armor reactor can reduce a damage effect).
3. **Validate-all-then-apply**: call `validate` on every queued effect first; only if all pass does any `apply` run, so an action never half-mutates the world. Effects are the *only* writers (the mutation-through-effects invariant); everything upstream sees a `ReadonlyWorld`.
4. Publish events on the bus through the reaction loop (§7.3). Mixins' `onEvent`, triggers, and AI enqueue reactions rather than recursing. The log and presentation observe.
5. Return an `ActionOutcome` (`done` / `rejected` / `fizzled`) with the final `cost`.

All iteration the pipeline performs (effects, entities, subscribers) is in a deterministic order — insertion order or sorted by `EntityId` — so a fixed seed reproduces a run exactly.

Why effects are separate from events: effects mutate state; events describe what happened. Save/replay and UI animation both key off events without re-running rules.

`Action` and `GameEvent` are discriminated unions on `type`. Dispatch (in handlers, mixin `onEvent`, AI, and the message log) uses **`ts-pattern`** with `.exhaustive()`, so adding a new action or event variant without handling it everywhere is a compile error rather than a silent runtime gap.

### 7.3 Reactors, the reaction loop & clocks

**Reactors — one reaction mechanism.** Entity reactions (mixin `onAction`/`onEvent`), place reactions (triggers), and global reactions (systems) are the same thing: a reaction registered for an event, differing only in *scope* and *phase*.

```ts
interface Reactor {
  on: string;                                   // event type
  scope: 'entity' | 'cell' | 'zone' | 'global';
  phase: 'pre' | 'post';
  react(ctx: ReactionCtx): Action[] | void;     // pre: ctx is a mutable ActionContext (cancelable)
}                                               // post: ctx wraps a read-only GameEvent
```

- **Phase.** `pre` fires *before* effects apply and receives a **mutable, cancelable** context — it can `reject`/`fizzle`/edit pending effects. This is exactly `onAction`. `post` fires *after*, receives a **read-only fact**, and may only enqueue new actions. This is `onEvent`. (The only mixin hook that is *not* a reactor is `modifyStats`, which is a pure derivation contribution, not an event reaction.)
- **Scope.** `entity` reactors come from an entity's mixins; `cell`/`zone` from triggers; `global` from systems. The §6.1 query/index layer resolves which reactors a scoped event hits without scanning everything.

**Reaction loop.** Events emitted during effect application can provoke further reactions — overflow events, status ticks, tile triggers, mixin `onEvent` enqueuing new actions. To keep "fire ignites oil ignites fire" from blowing the stack, reactions are never run recursively. Emitted events go on a FIFO queue that is drained to a fixed point: each event is dispatched to its subscribers, any new actions/effects they raise are enqueued, and processing continues until the queue empties. A configurable **max-depth/iteration guard** breaks pathological cascades and logs a warning. Within a drain pass, subscribers fire in deterministic order.

**Two clocks.** Time is one energy unit (§21, decision 2), but consumers tick against one of two clocks, and each must say which:

- **Per-actor clock** — advances on the afflicted actor's own turns, scaled by its speed. Status durations, resource regen, and cooldowns use this, so a hasted creature doesn't take extra poison ticks per world turn.
- **World clock** — advances once per global turn regardless of who acted. Environmental fields (scent diffusion, spreading gas, decaying influence) use this.

The timeline exposes both clocks; delayed effects (§11A.4) are keyed to the world clock, status/regen ticks to the per-actor clock.

### 7.4 Built-in action handlers

`move` (the single movement intent — the handler dispatches by what's at the target cell: **relocate** onto empty floor, **swap** with a `swappable` occupant, **redirect to a resolved interaction** against an occupant, or **bump** a wall), `attack`, `pickup`, `drop`, `equip`/`unequip`, `useItem`, `throwItem`, `wait`, `descend`/`ascend`, `openClose`. Each is registered and overridable.

A blocked move emits a **`bumped`** event (the bumper, the bumped `cell`, and the `target` occupant if any). Walking into a wall is a *free* bump: it emits `bumped` with no `target`, costs 0 energy, and doesn't relocate the actor. A swap is `moved`-only (no bump). Moving off the map is rejected. There is no separate `bump` action — "bump" is the *outcome of an interrupted move*.

**Bump-interaction dispatch.** What a bump into a non-swappable occupant *means* is not hardcoded: the move handler asks `Services.bumpInteractions` (a registry of `{ priority, claim(ctx) → Action | 'block' | undefined }` rules) and **redirects** to the winning `Action` — so the interaction becomes the actor's action and inherits its cost (a post-`bumped` reactor couldn't, since the reaction loop doesn't reschedule actors). Rules are tried high-to-low priority, registration order as the tiebreak; first non-`undefined` wins (`'block'` claims a no-op block, suppressing lower rules; no claim → blocked). The engine ships ONE default rule (priority 0): a non-allied occupant is attacked (`bumped(target)` prepended), an ally blocks. It is a **core default, config-toggleable** — `config.movement.bumpToAttack` (default `true`) gates whether `registerCoreContent` registers it; set it `false` for intent-based combat (bump = swap/block, strikes only via an explicit/`useOn` action) — not module-gated. A game shadows it with higher-priority rules (door → open, locker → loot) or suppresses it per-target with `'block'`. `swap` precedes the channel.

### 7.5 Steppers & the event-stream tap

**Steppers** are the sanctioned per-world-tick bulk-simulation slot.
`registerStepper(world, { id, layer, cadence, step })` runs `step(world, level, data)`
— a whole-grid update over a named `Float32` layer — every `cadence` world-ticks, as
a single coarse step inside the effect→event pipeline, and may emit events from its
`step`. It is a thin layer over the timeline's recurring **timer-effects**
(serialize-by-name, deterministically ordered against actors and other timers:
effects-before-actors at a tie, then by `seq`). The engine owns the slot, cadence,
ordering, and layer lifecycle; the math is *game* logic (e.g. conservative
atmosphere diffusion reading the composed `flags` layer's airtight bit). Save/load:
the timer round-trips by `effectId`, but its function does not serialize, so the game
**re-calls `registerStepper` after load** (like `levelProvider`/`makeFields`); the
bootstrap is idempotent (it won't double-schedule). Per-turn AI **field** stepping
(`FieldStore.tick`) is itself a *mechanic's* use of this slot, not a core privilege
(§11.3) — the engine does not auto-drive it.

The event bus exposes **`onAny(fn)`** — a wildcard that observes every event once,
in FIFO emission order, after its type listeners. An event emitted *from within*
another event's delivery (e.g. the flag index publishing `flags:changed` while
handling `entity:entered`) is queued and delivered after the in-progress event
finishes, so a **derived event never precedes its cause** for any listener. A
transport taps `onAny` to collect the ordered per-tick event stream (§6.5).

---
