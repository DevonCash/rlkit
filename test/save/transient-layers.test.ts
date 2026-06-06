/**
 * Transient-layer convention (§16): derived/rebuildable level layers are excluded
 * from the save and reconstructed by their services on load, while authoritative
 * layers persist. Asserted at the codec level (no services needed).
 */
import { describe, it, expect } from 'vitest';
import { encodeState, decodeState } from '../../src/adapters/storage';
import type { WorldState } from '../../src/core/world';
import { createLevel } from '../../src/core/level';

function stateWithLayers(): WorldState {
  const level = createLevel('L', 4, 4, 1); // persisted Uint16 'tiles'
  // Transient (derived caches) — should be dropped on encode:
  level.layers.set('visible', Uint8Array.from([1, 1, 0, 0]));
  level.layers.set('visible:p1', Uint8Array.from([1, 0, 0, 0]));
  level.layers.set('flags', Uint16Array.from([3, 1, 0, 2]));
  level.layers.set('field:scent', Float32Array.from([0, 1, 2, 3]));
  // Persisted — player memory + game-authoritative sim:
  level.layers.set('explored', Uint8Array.from([1, 1, 1, 0]));
  level.layers.set('explored:p1', Uint8Array.from([1, 1, 0, 0]));
  level.layers.set('pressure', Float32Array.from([100, 100, 0, 0]));
  return {
    entities: new Map(),
    levels: new Map([['L', level]]),
    timeline: { worldClock: 0, actors: [], timers: [], nextSeq: 0 },
    rng: [1, 2, 3, 4],
    turn: 0,
    nextEntityId: 0,
    triggers: { zones: [], triggers: [] },
    modules: [],
  };
}

describe('transient layers are excluded from the save (§16)', () => {
  it('drops visible/visible:*/flags/field:* and keeps tiles/explored/explored:*/pressure', () => {
    const decoded = decodeState(encodeState(stateWithLayers())) as WorldState;
    const layers = decoded.levels.get('L')!.layers;

    for (const dropped of ['visible', 'visible:p1', 'flags', 'field:scent']) {
      expect(layers.has(dropped)).toBe(false);
    }
    for (const kept of ['tiles', 'explored', 'explored:p1', 'pressure']) {
      expect(layers.has(kept)).toBe(true);
    }
    // Persisted layers keep identical bytes.
    expect(Array.from(layers.get('explored') as Uint8Array)).toEqual([1, 1, 1, 0]);
    expect(Array.from(layers.get('pressure') as Float32Array)).toEqual([100, 100, 0, 0]);
  });

  it('does not mutate the source state (transient layers still present in memory)', () => {
    const state = stateWithLayers();
    encodeState(state);
    expect(state.levels.get('L')!.layers.has('flags')).toBe(true);
    expect(state.levels.get('L')!.layers.has('visible')).toBe(true);
  });
});
