import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { createWorld, encodeSave, loadWorld } from '../../src/index';
import type { World } from '../../src/core/world';
import { createEntity } from '../../src/core/entity';
import type { Position } from '../../src/core/component';
import { createLevel } from '../../src/core/level';
import { cellOf } from '../../src/core/coords';
import { defaultConfig } from '../../src/config/defaults';

/**
 * Build a populated, mid-run world deterministically from a seed: a floor level,
 * a few positioned entities (some with mixins), a scheduled timer, timeline
 * actors, and an advanced RNG — i.e. every container the save must round-trip.
 */
function buildWorld(seed: number, nEntities: number): World {
  const w = createWorld({ config: defaultConfig, rng: seed });
  const level = createLevel('L', 8, 8, 1); // floor
  level.layers.set('scent', Float32Array.from([0.25, -1, 2.5, 0]));
  level.metadata = { depth: 1 };
  w.state.levels.set('L', level);

  for (let i = 0; i < nEntities; i++) {
    const id = `m${i}`;
    const x = 1 + (i % 6);
    const y = 1 + (i % 5);
    const e = createEntity(id, [{ type: 'position', x, y, levelId: 'L' }], i % 2 ? ['aiHunter'] : []);
    w.state.entities.set(id, e);
    w.services.queries.index(e);
    w.services.queries.place(id, 'L', cellOf({ x, y }, level.width));
    w.services.timeline.addActor(id, 100);
  }

  w.services.timeline.schedule(5, 'pulse', { from: 'test' });
  // Advance the RNG so its state is non-initial.
  for (let i = 0; i < 7; i++) w.services.rng.int(0, 1000);
  w.state.turn = 3;
  return w;
}

describe('save/load round-trip (§22.13)', () => {
  test.prop([fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 0, max: 12 })])(
    'load(save(state)) deep-equals the original state',
    (seed, n) => {
      const w = buildWorld(seed, n);
      const encoded = encodeSave(w); // refreshes state.rng to the live position
      const loaded = loadWorld(encoded);
      expect(loaded.state).toEqual(w.state);
    },
  );

  it('rebuilds the spatial index so queries work after load', () => {
    const w = buildWorld(42, 6);
    const loaded = loadWorld(encodeSave(w));
    // Every positioned entity is found at its cell, and component/mixin queries work.
    for (const e of w.state.entities.values()) {
      const pos = e.components.get('position') as Position;
      const cell = cellOf({ x: pos.x, y: pos.y }, 8);
      expect([...loaded.services.queries.at(cell, 'L')]).toEqual([e.id]);
    }
    const hunters = [...loaded.services.queries.withMixin('aiHunter')].map((e) => e.id);
    expect(hunters).toEqual([...w.services.queries.withMixin('aiHunter')].map((e) => e.id));
  });

  it('keeps Level.entityIndex empty on both sides (rebuilt live, not persisted)', () => {
    const w = buildWorld(7, 4);
    const loaded = loadWorld(encodeSave(w));
    expect(w.state.levels.get('L')!.entityIndex.size).toBe(0);
    expect(loaded.state.levels.get('L')!.entityIndex.size).toBe(0);
  });
});

describe('a loaded game continues identically (§22.13)', () => {
  it('resumes the RNG at the saved position', () => {
    const w = buildWorld(99, 3);
    const loaded = loadWorld(encodeSave(w));
    const a = Array.from({ length: 20 }, () => w.services.rng.int(0, 1_000_000));
    const b = Array.from({ length: 20 }, () => loaded.services.rng.int(0, 1_000_000));
    expect(b).toEqual(a);
  });

  it('preserves a pending timer so it fires at the same world tick', () => {
    const w = buildWorld(3, 2);
    const encoded = encodeSave(w);
    const loaded = loadWorld(encoded);
    // The scheduled 'pulse' timer rides in timeline state; both worlds agree.
    expect(loaded.state.timeline.timers).toEqual(w.state.timeline.timers);
    expect(loaded.state.timeline.timers[0]).toMatchObject({ effectId: 'pulse', fireAt: 5 });
  });
});
