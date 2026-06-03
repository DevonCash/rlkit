import { describe, it, expect } from 'vitest';
import { createWorld } from '../../../src/index';
import { createLevel, setTile, levelCell } from '../../../src/core/level';
import { defaultConfig } from '../../../src/config/defaults';
import type { FieldDescriptor } from '../../../src/core/fields';

const W = 9;
const H = 3;

function setup() {
  const w = createWorld({ config: defaultConfig, rng: 1 });
  const lvl = createLevel('L', W, H, 1); // all floor
  w.state.levels.set('L', lvl);
  return { w, lvl };
}

describe('scent field (§22.11)', () => {
  it('does not bleed through an opaque wall', () => {
    const { w, lvl } = setup();
    // A full opaque wall column at x=4 splits the corridor.
    for (let y = 0; y < H; y++) setTile(lvl, levelCell(lvl, 4, y), 0);
    const source = levelCell(lvl, 2, 1); // west of the wall
    const desc: FieldDescriptor = {
      id: 'scent',
      kind: 'scent',
      perTurn: true,
      params: { source: { kind: 'cells', cells: [source] }, deposit: 10, decay: 0.95, diffusion: 0.3 },
    };
    const store = w.services.fields.forLevel('L');
    store.ensure(desc);

    for (let i = 0; i < 12; i++) store.tick(); // let scent diffuse for several turns
    const field = store.data('scent');

    expect(field[source]!).toBeGreaterThan(0); // present at the source
    expect(field[levelCell(lvl, 3, 1)]!).toBeGreaterThan(0); // diffused up to the wall
    expect(field[levelCell(lvl, 5, 1)]!).toBe(0); // but NOT past the opaque wall
    expect(field[levelCell(lvl, 6, 1)]!).toBe(0);
  });

  it('decays over time once the source stops depositing', () => {
    const { w, lvl } = setup();
    const source = levelCell(lvl, 4, 1);
    const cells = [source];
    const desc: FieldDescriptor = {
      id: 'scent',
      kind: 'scent',
      perTurn: true,
      params: { source: { kind: 'cells', cells }, deposit: 10, decay: 0.8, diffusion: 0.1 },
    };
    const store = w.services.fields.forLevel('L');
    store.ensure(desc);
    store.tick();
    const peak = store.data('scent')[source]!;

    cells.length = 0; // the target left — no more deposits
    for (let i = 0; i < 5; i++) store.tick();
    expect(store.data('scent')[source]!).toBeLessThan(peak); // trail cooled
  });
});

describe('influence field', () => {
  it('falls off with distance and sums threats (negative) below allies', () => {
    const { w, lvl } = setup();
    const ally = levelCell(lvl, 2, 1);
    const threat = levelCell(lvl, 6, 1);
    const store = w.services.fields.forLevel('L');
    store.ensure({ id: 'ally', kind: 'influence', params: { source: { kind: 'cells', cells: [ally] }, strength: 1, falloffRadius: 4 } });
    store.ensure({ id: 'threat', kind: 'influence', params: { source: { kind: 'cells', cells: [threat] }, strength: -1, falloffRadius: 4 } });

    const af = store.data('ally');
    expect(af[ally]!).toBeCloseTo(1, 5); // strongest at the source
    expect(af[levelCell(lvl, 3, 1)]!).toBeLessThan(af[ally]!); // weaker farther out
    const tf = store.data('threat');
    expect(tf[threat]!).toBeLessThan(0); // threat is negative pressure
  });
});
