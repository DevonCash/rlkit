# Core Model — Entities, Components, Mixins & World

> Part of the **rlkit** engine spec — sections §5–6. The hybrid data+mixins model, blueprints, the World state/services split, the query/index layer, the fork seam, and the generic Registry + serialize-by-name rule.
>
> See also: 02-simulation · 08-persistence. Full map and reading order: [INDEX.md](./INDEX.md).

---

## 5. The hybrid model: entities, components, mixins

### 5.1 Components (data) — schema-first with Zod

A component is plain serializable data with a string `type` tag. Components cross both untrusted boundaries (they come from blueprints/content and from loaded save blobs), so per the validation rule in §16.4 they are **defined as Zod schemas, with the static type inferred** — one declaration, no hand-written interface alongside it. Components are registered so save/load knows how to revive and validate them.

```ts
import { z } from 'zod';

const Position = z.object({
  type: z.literal('position'),
  x: z.number().int(), y: z.number().int(), levelId: z.string(),
});
type Position = z.infer<typeof Position>;

const Renderable = z.object({
  type: z.literal('renderable'),
  glyph: z.string(), fg: z.string(), bg: z.string().optional(), layer: z.number().int(),
});
type Renderable = z.infer<typeof Renderable>;

// Resources, Statuses, Inventory, ... follow the same schema-first pattern.
// The component registry stores { schema, type } per component so load() can validate.
```

The base `Component` is just `{ type: string }`; concrete components narrow `type` with `z.literal`, which keeps the union discriminated for `ts-pattern` matching elsewhere. Note: this schema-first rule applies to **data that is persisted or authored** (components, blueprints, the save blob). Runtime-only types that never get serialized — `Action`, `GameEvent`, `ActionContext`, `RenderFrame` — stay as plain hand-written interfaces; there is no second copy of anything (see §16.4).

### 5.2 Entities (data)

An entity is an id plus a component map. No methods.

```ts
type EntityId = string;

interface Entity {
  id: EntityId;
  components: Map<string, Component>;
  mixins: string[];          // names of attached behaviors
}
```

Typed accessors live outside the data:

```ts
function get<C extends Component>(e: Entity, type: C['type']): C | undefined;
function has(e: Entity, type: string): boolean;
function set(e: Entity, c: Component): void;
```

### 5.3 Mixins (behavior)

A mixin is the "hybrid" piece: it bundles behavior that operates on components, declares its data dependencies, and hooks into the action/event pipeline. Mixins are composed onto entities by name; the entity stays pure data, the mixin supplies the logic.

```ts
interface Mixin {
  name: string;
  requires: string[];                       // component types this mixin needs
  // onAction/onEvent are sugar for registering entity-scoped reactors (§7.3):
  //   onAction = pre-phase, cancelable, gets a mutable ActionContext
  onAction?(ctx: ActionContext, self: Entity): void;
  //   onEvent  = post-phase, gets a read-only fact, may enqueue reactions
  onEvent?(ev: GameEvent, self: Entity, world: ReadonlyWorld): Action[] | void;
  // modifyStats is NOT a reactor — it's a pure contribution to a derived value (§9.1).
  // Revised (M4): it CONTRIBUTES typed modifiers rather than mutating a block, so
  // deriveStats can apply them in fixed phase order (base→add→mul→clamp) and the
  // result is independent of gather order (§22.7).
  modifyStats?(self: Entity, world: ReadonlyWorld): StatModifier[];
  // takeTurn (added M6) is the AI hook (§11.2): decide this entity's action on
  // its turn, or return undefined to let the next AI mixin (priority stack) try.
  takeTurn?(self: Entity, world: ReadonlyWorld): Action | undefined;
}
```

A mixin is, in effect, a bundle of **entity-scoped reactors** (its `onAction`/`onEvent`) plus an optional stat contribution. Triggers (§11A.5) are the same reactors at *place* scope, and systems are reactors at *global* scope — one mechanism, three scopes (§7.3).

Examples: `Attacker` (turns a bump into an attack action), `Flammable` (reacts to fire events), `AIWanderer` (emits a move action when it's the entity's turn), `Equippable`, `Openable` (doors).

A mixin **registry** maps names → definitions; entities reference mixins by name so they serialize cleanly. Mixin resolution order is deterministic (declared array order) so behavior is predictable.

### 5.4 Archetypes / blueprints (content as data)

Entities are spawned from blueprints — data describing components + mixins + default values. Blueprints are configurable content, kept out of engine logic.

```ts
interface Blueprint {
  id: string;                  // 'goblin', 'health-potion'
  components: Component[];
  mixins: string[];
  tags?: string[];
}
const goblin = spawn(world, blueprints.get('goblin'), { at: { x, y, levelId } });
```

---

## 6. World, levels, and the simulation loop

`World` separates **state** (serializable data — the whole save file) from **services** (reconstructed logic — never serialized). This one split makes save/load and `fork()` fall out: save writes `state`; load rebuilds `services` from registries and reattaches them; `fork()` copies `state` and shares `services`.

```ts
interface World {
  state: WorldState;          // serializable — see §16
  services: Services;         // reconstructed, never serialized
}

interface WorldState {
  entities: Map<EntityId, Entity>;
  levels: Map<string, Level>;
  timeline: TimelineState;    // turn order + pending delayed effects (§7.1)
  rng: RNGState;
  turn: number;
}

interface Services {
  bus: EventBus;              // + reactor dispatch (§7.3)
  queries: Queries;          // §6.1
  timeline: Timeline;        // operates on state.timeline
  registries: Registries;    // §6.3
  config: EngineConfig;
}
```

The driver is a cooperative loop, not a fixed tick. The timeline hands out the next entry; the loop blocks on the player's input but runs AI synchronously:

```
loop:
  entry = timeline.next()
  if entry.kind == 'effect':           # delayed effect comes due
      resolve effect; continue
  actor = entry.id
  if actor is player:        # wait for a command from the input adapter
      action = await pendingPlayerCommand
  else:                      # AI mixin produces an action
      action = decideAI(actor)
  result = resolve(action)   # validate -> effects -> events
  timeline.reschedule(actor, result.cost)
  render(world)              # presentation observes; core doesn't call canvas directly
```

(The `render` step is an event the presentation layer listens for, not a direct core→canvas call — keeping the headless boundary intact.)

This is the turn-based driver (`takeTurn`/`step`). The same timeline backs two more drivers without changing the model (§25): `tickRealtime` advances a fixed number of logical ticks with **non-blocking** buffered input instead of awaiting a command, and `tickRealtimeMulti` does the same for a *set* of player actors plus AI — both pace off `timeline.peekNextDue()`/`advanceClock()`. Because the timeline already orders actors deterministically by id, real-time and co-op inherit determinism for free.

### 6.1 Entity query/index layer

Systems and event dispatch need to find entities fast — "everything with `position` + `resources`," "every entity carrying the `AIHunter` mixin," "occupants of this cell." Scanning all entities per query is O(entities) and would dominate as content grows, so the `World` maintains indexes updated incrementally on component/mixin add/remove and on movement:

```ts
interface Queries {
  with(...componentTypes: string[]): Iterable<Entity>;   // backed by per-component id sets
  withMixin(name: string): Iterable<Entity>;
  at(cell: Cell): Iterable<EntityId>;                    // the Level spatial index
  byTag(tag: string): Iterable<EntityId>;               // §11A.1
}
```

This is the one data-oriented idea borrowed from ECS — per-component id sets (small archetype buckets if profiling wants them) — without adopting an ECS system-sweep. All index iteration is order-stable for determinism.

### 6.2 World forking (designed-for, not built)

AI "what-if" lookahead (evaluate an action's consequences before committing) is out of scope now but is kept *possible* by the state/services split plus the mutation-through-effects invariant (§7.2). A later `world.fork()` is just "copy-on-write `state`, share `services`": the AI resolves actions against the forked state and discards it. No engine redesign required — we only avoid putting non-serializable handles or hidden mutable state into `WorldState`.

### 6.3 Registries & the serialize-by-name rule

Every extensible kind in the engine — components, mixins, blueprints, tiles, action handlers, effects, status definitions, generators, field producers, trigger predicates, factions — is held in the *same* structure, so there is one primitive, not a dozen:

```ts
interface Registry<T> { register(id: string, def: T): void; get(id: string): T; ids(): string[]; }
type Registries = { [kind: string]: Registry<unknown> };  // components, mixins, effects, ...
```

This is what makes one rule cover all of serialization: **state stores names, not behavior.** An entity stores mixin *names*; a timer stores an `effectId`; a trigger stores `testId`/`effectId`; a save stores component *type* tags. Functions and class instances are never serialized — load looks each name up in its registry and reattaches the live definition. Every "by reference, no closures" note elsewhere in this spec is an instance of this single rule.

---
