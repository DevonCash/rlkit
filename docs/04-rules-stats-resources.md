# Rules — Stats, Resources, Combat, Status & Items

> Part of the **rlkit** engine spec — sections §9–10. The two rule primitives (derived stats; bounded resources with overflow/underflow events) and items/inventory/equipment built on them.
>
> See also: 02-simulation · 06-cross-cutting-primitives. Full map and reading order: [INDEX.md](./INDEX.md).

---

## 9. Stats, resources, combat & status effects

Four concerns, two primitives: **stats** (derived scalars) and **resources** (bounded pools). Combat and status effects are *consumers* of those primitives, not separate rule engines — which is what keeps this section small.

> **Multi-instance state lives in container components.** The component map is keyed by `type` (§5.2), so an entity can't hold three separate `resource` components. Resources and active statuses are therefore each stored in one container component (`resources`, `statuses`) keyed internally by id. Stats need no component — they're derived.

### 9.1 Stats — derived scalars

A registry of named stats; any stat is content (`attack`, `defense`, `fire-resist`, `max-hp`, `speed`, `sight-radius`, …). A stat's value is `base + modifiers`, recomputed on demand (never stored stale) by folding mixin `modifyStats` contributions from equipment, buffs, and traits. The open `StatBlock` from §5 is the resolved output.

```ts
interface StatBlock { [stat: string]: number; }
function deriveStats(e: Entity, world: World): StatBlock;

interface StatModifier { stat: string; phase: 'add' | 'mul'; amount: number; }
```

Modifiers are gathered in mixin declaration order (§21, decision 5) but **applied in a fixed phase order — `base → additive → multiplicative → clamp`** — so a `+5` and a `×1.2` never fight over sequence. The phase order is logic; the modifier amounts and clamp bounds are configurable.

> **Implementation note (M4):** `Mixin.modifyStats` *contributes* `StatModifier[]` (signature `modifyStats?(self, world): StatModifier[]`) rather than mutating a `StatBlock` — that is what makes the phase pipeline order-independent (§22.7). `deriveStats` gathers contributions from mixins and active statuses (and equipment, §10), groups by stat, then applies `base → Σadd → Πmul → clamp`. Base values come from a `stats` component (`{type:'stats', base}`) or the `StatDef.default`; clamp bounds (`min`/`max`) live on the `StatDef` (content).

### 9.2 Resources — bounded pools

A registry of named resources; any resource is content. A resource's `max` is a **stat**, so a +10 max-HP ring flows through the stat pipeline automatically; the pool just re-clamps when stats change.

```ts
// Components → schema-first (Zod) per §16.4; shown as interfaces for readability.
interface Resources extends Component {
  type: 'resources';
  pools: Record<string, { current: number }>;   // keyed by resourceId: 'hp','mana','hunger',...
}
interface ResourceDef {            // registry entry (content)
  id: string;
  max: string;                     // stat name providing the cap, e.g. 'max-hp'
  regen?: number;                  // per-turn delta (config); ticked like status/scent fields
  thresholds?: Threshold[];
}
interface Threshold { at?: number; below?: number; emit?: string; status?: string; duration?: number; }
```

Every change goes through one operation, applied as an `Effect` (§7.2), that clamps to `[0, max]` and **emits events for anything lost or any bound crossed** — the single chokepoint that makes resources reactable:

```ts
function changeResource(e: Entity, resourceId: string, delta: number, cause: string): GameEvent[];
```

For `raw = current + delta`:

- Clamp `current = clamp(raw, 0, max)`.
- If `raw > max`: emit **`resource:overflow`** `{ entity, resourceId, excess: raw - max, cause }`.
- If `raw < 0`: emit **`resource:underflow`** `{ entity, resourceId, deficit: -raw, cause }` (overkill, on `hp`).
- Fire any `Threshold` whose bound was crossed (`emit` an event and/or apply a `status`).

Excess/deficit is **clamped-and-lost by default**, but the event lets content reclaim it: overheal → temporary shield, hunger past full → sickness, mana past cap → wild surge, overkill → gib. Whether anything reacts is content; the clamp-and-emit mechanism is logic.

The **`cause` discriminator** matters because the same clamp happens for different reasons and reactions should differ. When a `max` stat drops below `current` (a max-HP buff expires), re-clamping emits `resource:overflow` with `cause: 'max-reduced'` — distinct from `cause: 'restore'`, so a debuff never accidentally grants a shield. Causes are an open set: `'restore' | 'spend' | 'damage' | 'regen' | 'max-reduced' | …`.

**Action costs** reuse this: a handler declares resource costs (a spell costs mana) by pushing a `changeResourceEffect(..., 'spend', { requireSufficient: true })`. Its `validate` returns false when the pool can't cover the cost, so the action is **rejected atomically** (no time passes) — the idiomatic mechanism in this engine. *(Implementation note (M4): the §9.2 prose originally said `onAction` cancels; rejection via the effect's `validate` is equivalent and matches validate-all-then-apply.)*

### 9.3 Combat — a consumer of the primitives

Combat is an action handler that reads stats and applies a resource delta. The **damage formula** (configurable) turns attacker/defender stats into a number; the effect is `changeResource(target, 'hp', -amount, 'damage')`. Resistances and armor are just stats the formula reads. Death is the `hp` threshold `{ at: 0, emit: 'died' }`; mixins react to `died` (drop loot, remove from the timeline, on-death effects).

```ts
type DamageFormula = (attacker: StatBlock, defender: StatBlock, rng: RNG) => DamageResult;
```

### 9.4 Status effects — timed bundles over the primitives

A status effect is a timed bundle of stat modifiers and/or per-turn resource deltas, so poison, regen, burning, and haste need no bespoke code.

```ts
interface Statuses extends Component {
  type: 'statuses';
  active: { effectId: string; duration: number; stacks?: number }[];  // energy units (§21, decision 2)
}
```

Effect definitions (registry) declare some combination of `modifyStats` (haste → `+speed`), a per-tick `changeResource` (poison → `hp -n`, `cause:'damage'`), and `onExpire`. Durations, stack rules, and per-tick amounts are configurable; the timeline ticks active statuses on the per-actor clock (§7.3).

---

## 10. Items, inventory, equipment

Items are entities with item-flavored components and mixins — not a separate class hierarchy. This keeps "a sword on the floor" and "a sword in a pack" the same object.

```ts
interface Item extends Component { type: 'item'; name: string; stackable: boolean; qty: number; weight?: number; }
interface Equipment extends Component { type: 'equipment'; slot: string; bonuses: Partial<StatBlock>; }
interface Consumable extends Component { type: 'consumable'; uses: number; effect: string; /* effect id in registry */ }
```

- **Inventory** lives on the carrier as an `Inventory` component holding item entity ids; capacity/weight rules are config.
- **Equipment** uses named slots (config: which slots exist). Equipping adds `modifyStats` via the `Equippable` mixin.
- **Use** is the `useItem` action → looks up the consumable's effect in the effect registry → produces effects/events (heal = `changeResource`, apply status, etc.).

Stacking, identification, charges, and curses are mixins/components layered on, not special-cased in the inventory core.

---
