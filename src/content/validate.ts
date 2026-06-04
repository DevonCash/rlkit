/**
 * content/validate — schema-first boundary validation for save blobs (§16.4).
 *
 * Two boundaries take data the engine didn't produce: authored content
 * (blueprints) and loaded save blobs (possibly old or hand-edited). Both are
 * validated with Zod at the edge — never in hot loops. Per the committed rule,
 * persisted types have ONE declaration: the canonical runtime interfaces live
 * in `core` (`WorldState`, `Level`, `Entity`, `TimelineState`). The schemas here
 * are *validators typed against those interfaces* — `z.infer` of a schema must
 * stay assignable to its core type (a compile-time guard below catches drift),
 * so no type is written twice.
 *
 * The `SaveBlob` envelope carries a `schemaVersion`; `migrate` upgrades an old
 * blob through a caller-supplied migration table BEFORE validation against the
 * current schema (§16). Validation runs in exactly two places: registering
 * content, and inside `loadWorld` after migration + devalue decoding.
 */
import { z } from 'zod';
import { ComponentData, Blueprint } from '../core/component';
import type { Entity } from '../core/entity';
import type { Level } from '../core/level';
import type { TimelineState, WorldState } from '../core/world';
import type { TriggerState } from '../core/trigger';

/** The save-format version this build writes and validates against. */
export const CURRENT_SCHEMA_VERSION = 1;

// --- state schemas (validators for the core WorldState shape) --------------

const EntitySchema = z.object({
  id: z.string(),
  components: z.map(z.string(), ComponentData),
  mixins: z.array(z.string()),
});

const LayerSchema = z.union([
  z.instanceof(Uint16Array),
  z.instanceof(Float32Array),
  z.instanceof(Uint8Array),
]);

const LevelSchema = z.object({
  id: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  layers: z.map(z.string(), LayerSchema),
  entityIndex: z.map(z.number().int(), z.array(z.string())),
  metadata: z.record(z.string(), z.unknown()),
});

const TimelineStateSchema = z.object({
  worldClock: z.number(),
  actors: z.array(
    z.object({
      id: z.string(),
      energy: z.number(),
      speed: z.number(),
      clock: z.number(),
    }),
  ),
  timers: z.array(
    z.object({
      fireAt: z.number(),
      effectId: z.string(),
      payload: z.unknown().optional(),
      seq: z.number(),
    }),
  ),
  nextSeq: z.number(),
});

/** pure-rand xoroshiro128plus state — an integer array (§16). */
const RngStateSchema = z.array(z.number());

const ZoneSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  cells: z.array(z.number().int()),
  data: z.record(z.string(), z.unknown()).optional(),
});

const TriggerInstanceSchema = z.object({
  id: z.string(),
  on: z.string(),
  scope: z.enum(['cell', 'zone']),
  levelId: z.string(),
  cell: z.number().int().optional(),
  zoneId: z.string().optional(),
  testId: z.string().optional(),
  effectId: z.string(),
  once: z.boolean().optional(),
  fired: z.boolean().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const TriggerStateSchema = z.object({
  zones: z.array(ZoneSchema),
  triggers: z.array(TriggerInstanceSchema),
});

const SerializedWorldSchema = z.object({
  entities: z.map(z.string(), EntitySchema),
  levels: z.map(z.string(), LevelSchema),
  timeline: TimelineStateSchema,
  rng: RngStateSchema,
  turn: z.number(),
  nextEntityId: z.number(),
  triggers: TriggerStateSchema,
  // Default keeps pre-manifest saves parseable (they load as "no modules").
  modules: z.array(z.string()).default([]),
});

export const SaveBlobSchema = z.object({
  schemaVersion: z.number().int(),
  world: SerializedWorldSchema,
});

/** The save envelope: a version tag wrapping the serializable `WorldState`. */
export interface SaveBlob {
  schemaVersion: number;
  world: WorldState;
}

// Compile-time guard: each schema's inferred output must stay assignable to the
// canonical core interface, so a drift between the two surfaces fails the build
// instead of silently corrupting saves. (One declaration; this only asserts the
// validator agrees with it.) Exported so the unused-type check leaves it be.
type AssertExtends<A extends B, B> = A;
export type SchemaMatchesCore = [
  AssertExtends<z.infer<typeof EntitySchema>, Entity>,
  AssertExtends<z.infer<typeof LevelSchema>, Level>,
  AssertExtends<z.infer<typeof TimelineStateSchema>, TimelineState>,
  AssertExtends<z.infer<typeof TriggerStateSchema>, TriggerState>,
  AssertExtends<z.infer<typeof SerializedWorldSchema>, WorldState>,
];

// --- parse helpers ---------------------------------------------------------

/** Validate an untrusted save blob; throws (via Zod) on any mismatch. */
export function parseSave(raw: unknown): SaveBlob {
  return SaveBlobSchema.parse(raw) as unknown as SaveBlob;
}

/** Validate an untrusted blueprint; throws (via Zod) on any mismatch. */
export function parseBlueprint(raw: unknown): Blueprint {
  return Blueprint.parse(raw);
}

// --- migration -------------------------------------------------------------

/** Upgrade an old blob one schema version forward. Must bump `schemaVersion`. */
export type Migration = (blob: { schemaVersion: number; [k: string]: unknown }) => {
  schemaVersion: number;
  [k: string]: unknown;
};

/** Migrations keyed by the version they upgrade FROM (`v` → `v+1`). */
export type MigrationTable = Record<number, Migration>;

/**
 * Step a decoded blob up to {@link CURRENT_SCHEMA_VERSION} using `table`, then
 * hand off to {@link parseSave}. Throws on a missing step, a non-advancing
 * migration, or a blob newer than this build supports.
 */
export function migrate(raw: unknown, table: MigrationTable = {}): unknown {
  if (typeof raw !== 'object' || raw === null || typeof (raw as { schemaVersion?: unknown }).schemaVersion !== 'number') {
    throw new Error('migrate: blob is missing a numeric schemaVersion');
  }
  let cur = raw as { schemaVersion: number; [k: string]: unknown };
  while (cur.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const from = cur.schemaVersion;
    const step = table[from];
    if (!step) throw new Error(`migrate: no migration from schemaVersion ${from}`);
    cur = step(cur);
    if (cur.schemaVersion <= from) {
      throw new Error(`migrate: migration from ${from} did not advance schemaVersion`);
    }
  }
  if (cur.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `migrate: blob schemaVersion ${cur.schemaVersion} is newer than supported ${CURRENT_SCHEMA_VERSION}`,
    );
  }
  return cur;
}
