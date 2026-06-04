import { describe, it, expect } from 'vitest';
import { encodeState, decodeState, createStorage, createMemoryStorage } from '../../src/adapters/storage';
import type { WorldState } from '../../src/core/world';
import { createEntity } from '../../src/core/entity';
import { createLevel } from '../../src/core/level';

/** A hand-built state exercising every container type the codec must preserve. */
function sampleState(): WorldState {
  const hero = createEntity('hero', [{ type: 'position', x: 2, y: 3, levelId: 'L' }], ['aiHunter']);
  const level = createLevel('L', 4, 4, 1); // Uint16 'tiles' layer
  level.layers.set('scent', Float32Array.from([0, 0.5, 1.25, -3.5]));
  level.layers.set('flags', Uint8Array.from([1, 0, 255, 7]));
  level.metadata = { depth: 2, theme: 'cave' };
  return {
    entities: new Map([['hero', hero]]),
    levels: new Map([['L', level]]),
    timeline: {
      worldClock: 5,
      actors: [{ id: 'hero', energy: 10, speed: 100, clock: 3 }],
      timers: [{ fireAt: 8, effectId: 'pulse', payload: { n: 1 }, seq: 0 }],
      nextSeq: 1,
    },
    rng: [1, 2, 3, 4],
    turn: 7,
    nextEntityId: 1,
    triggers: { zones: [], triggers: [] },
    modules: [],
  };
}

describe('storage codec (§22.13)', () => {
  it('round-trips Maps and typed-array layers through devalue', () => {
    const state = sampleState();
    const decoded = decodeState(encodeState(state)) as WorldState;

    // Maps survive as Maps (devalue-native), deep-equal by value.
    expect(decoded).toEqual(state);
    expect(decoded.entities).toBeInstanceOf(Map);
    expect(decoded.levels).toBeInstanceOf(Map);

    // typed-array layers come back as the right typed arrays with identical bytes.
    const level = decoded.levels.get('L')!;
    expect(level.layers.get('tiles')).toBeInstanceOf(Uint16Array);
    expect(level.layers.get('scent')).toBeInstanceOf(Float32Array);
    expect(level.layers.get('flags')).toBeInstanceOf(Uint8Array);
    expect(Array.from(level.layers.get('scent') as Float32Array)).toEqual([0, 0.5, 1.25, -3.5]);
    expect(Array.from(level.layers.get('flags') as Uint8Array)).toEqual([1, 0, 255, 7]);
  });

  it('preserves the entity component map and mixin names', () => {
    const decoded = decodeState(encodeState(sampleState())) as WorldState;
    const hero = decoded.entities.get('hero')!;
    expect(hero.components.get('position')).toEqual({ type: 'position', x: 2, y: 3, levelId: 'L' });
    expect(hero.mixins).toEqual(['aiHunter']);
  });

  it('a Storage backend saves and loads a slot, returning null for an empty slot', async () => {
    const store = createStorage(createMemoryStorage());
    expect(await store.load('slot1')).toBeNull();
    await store.save('slot1', { schemaVersion: 1, world: sampleState() });
    const blob = await store.load('slot1');
    expect(blob?.schemaVersion).toBe(1);
    expect(blob?.world).toEqual(sampleState());
  });
});
