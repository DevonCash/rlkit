import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/index';
import { buildLevel } from '../../src/mapgen/build-level';
import { spawn } from '../../src/sim/spawn';
import { get } from '../../src/core/entity';
import type { Position } from '../../src/core/component';
import type { Blueprint } from '../../src/core/component';
import type { Registry } from '../../src/core/registry';
import { defaultConfig } from '../../src/config/defaults';

const goblin: Blueprint = {
  id: 'goblin',
  components: [{ type: 'renderable', glyph: 'g', fg: '#0f0', layer: 1 }],
  mixins: ['actor'],
  tags: ['monster', 'undead'],
};

function worldWithGoblin(seed = 1) {
  const w = createWorld({ config: defaultConfig, rng: seed });
  (w.services.registries.blueprints as Registry<Blueprint>).register('goblin', goblin);
  return w;
}

describe('spawn', () => {
  it('instantiates a blueprint at a cell, indexed and placed', () => {
    const w = worldWithGoblin();
    const { level, entrance } = buildLevel(w, { generator: 'bsp', width: 30, height: 20 });

    const e = spawn(w, 'goblin', { at: entrance, levelId: level.id });
    expect(w.state.entities.get(e.id)).toBe(e);
    expect(e.mixins).toEqual(['actor']);

    const pos = get<Position>(e, 'position')!;
    expect(pos.levelId).toBe(level.id);
    expect(level.width * pos.y + pos.x).toBe(entrance); // position matches the spawn cell

    expect([...w.services.queries.at(entrance, level.id)]).toContain(e.id);
    expect([...w.services.queries.byTag('monster')]).toContain(e.id);
  });

  it('mints deterministic sequential ids and bumps the counter', () => {
    const w = worldWithGoblin();
    const { level, entrance } = buildLevel(w, { generator: 'bsp', width: 30, height: 20 });
    const a = spawn(w, 'goblin', { at: entrance, levelId: level.id });
    const b = spawn(w, 'goblin', { at: entrance, levelId: level.id });
    expect(a.id).toBe('e0');
    expect(b.id).toBe('e1');
    expect(w.state.nextEntityId).toBe(2);
  });

  it('deep-clones components so instances do not share state', () => {
    const w = worldWithGoblin();
    const { level, entrance } = buildLevel(w, { generator: 'bsp', width: 30, height: 20 });
    const a = spawn(w, 'goblin', { at: entrance, levelId: level.id });
    const b = spawn(w, 'goblin', { at: entrance, levelId: level.id });
    expect(a.components.get('renderable')).not.toBe(b.components.get('renderable'));
  });

  it('throws on unknown blueprint or level', () => {
    const w = worldWithGoblin();
    expect(() => spawn(w, 'dragon', { at: 0, levelId: 'L' })).toThrow(/unknown blueprint/);
    expect(() => spawn(w, 'goblin', { at: 0, levelId: 'nope' })).toThrow(/unknown level/);
  });
});
