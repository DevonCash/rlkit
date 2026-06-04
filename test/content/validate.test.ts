import { describe, it, expect } from 'vitest';
import {
  parseSave,
  migrate,
  CURRENT_SCHEMA_VERSION,
  type MigrationTable,
} from '../../src/content/validate';
import type { WorldState } from '../../src/core/world';
import { createEntity } from '../../src/core/entity';
import { createLevel } from '../../src/core/level';

function sampleWorld(): WorldState {
  return {
    entities: new Map([['hero', createEntity('hero', [{ type: 'position', x: 0, y: 0, levelId: 'L' }])]]),
    levels: new Map([['L', createLevel('L', 3, 3, 1)]]),
    timeline: { worldClock: 0, actors: [], timers: [], nextSeq: 0 },
    rng: [1, 2, 3, 4],
    turn: 0,
    nextEntityId: 1,
    triggers: { zones: [], triggers: [] },
    modules: [],
  };
}

describe('save validation (§22.13)', () => {
  it('accepts a well-formed current-version blob', () => {
    const blob = { schemaVersion: CURRENT_SCHEMA_VERSION, world: sampleWorld() };
    expect(() => parseSave(blob)).not.toThrow();
    expect(parseSave(blob).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('rejects a malformed blob', () => {
    expect(() => parseSave({ schemaVersion: 1 })).toThrow(); // missing world
    expect(() => parseSave({ world: sampleWorld() })).toThrow(); // missing version
    expect(() => parseSave({ schemaVersion: 1, world: { entities: 'nope' } })).toThrow();
    expect(() => parseSave('not an object')).toThrow();
  });

  it('migrates an old-version blob up to the current version, then validates', () => {
    // A v0 blob shaped like the old format (turn under a different key).
    const v0 = { schemaVersion: 0, world: sampleWorld(), legacyTurn: 4 };
    const table: MigrationTable = {
      0: (b) => ({ ...b, schemaVersion: 1 }), // v0 → v1: drop the legacy field
    };
    const migrated = migrate(v0, table);
    expect((migrated as { schemaVersion: number }).schemaVersion).toBe(1);
    expect(() => parseSave(migrated)).not.toThrow();
  });

  it('throws when no migration exists for an old version', () => {
    expect(() => migrate({ schemaVersion: 0, world: sampleWorld() }, {})).toThrow(/no migration/);
  });

  it('throws on a blob newer than this build supports', () => {
    expect(() => migrate({ schemaVersion: CURRENT_SCHEMA_VERSION + 1, world: {} })).toThrow(/newer/);
  });

  it('throws when a blob lacks a numeric schemaVersion', () => {
    expect(() => migrate({ world: {} })).toThrow(/schemaVersion/);
  });
});
