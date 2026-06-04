import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/index';
import { hungerModule } from '../../src/modules/hunger';
import { perform, runReactions } from '../../src/sim/action';
import { tickActor } from '../../src/sim/status';
import { createEntity, get } from '../../src/core/entity';
import type { Resources } from '../../src/core/component';
import { defaultConfig } from '../../src/config/defaults';

function hero(extra: Record<string, { current: number }> = {}) {
  return createEntity('hero', [
    { type: 'stats', base: { 'max-hp': 20, 'max-satiation': 10 } },
    { type: 'inventory', items: [] },
    { type: 'resources', pools: { hp: { current: 20 }, satiation: { current: 10 }, ...extra } },
  ]);
}
const pools = (w: ReturnType<typeof createWorld>) => get<Resources>(w.state.entities.get('hero')!, 'resources')!.pools;

describe('hungerModule', () => {
  it('drains satiation each turn, then starves hp once empty', () => {
    const w = createWorld({ config: defaultConfig, rng: 1, modules: [hungerModule({ drainPerTurn: 5, starveDamage: 3 })] });
    w.state.entities.set('hero', hero());
    const tick = () => runReactions(w, tickActor(w, 'hero'));

    tick(); // 10 → 5
    expect(pools(w).satiation!.current).toBe(5);
    expect(pools(w).hp!.current).toBe(20);
    tick(); // 5 → 0 (no underflow yet)
    expect(pools(w).satiation!.current).toBe(0);
    expect(pools(w).hp!.current).toBe(20);
    tick(); // 0 → underflow → starve 3 hp
    expect(pools(w).satiation!.current).toBe(0);
    expect(pools(w).hp!.current).toBe(17);
  });

  it('food restores satiation', () => {
    const w = createWorld({
      config: defaultConfig,
      rng: 1,
      modules: [hungerModule({ foods: [{ effect: 'eat-bread', amount: 8 }] })],
    });
    const h = hero();
    get<{ type: 'resources'; pools: Record<string, { current: number }> }>(h, 'resources')!.pools.satiation!.current = 2;
    w.state.entities.set('hero', h);
    const bread = createEntity('bread', [
      { type: 'item', name: 'Bread', stackable: false, qty: 1 },
      { type: 'consumable', uses: 1, effect: 'eat-bread' },
    ]);
    w.state.entities.set('bread', bread);
    get<{ type: 'inventory'; items: string[] }>(h, 'inventory')!.items.push('bread');

    perform(w, { type: 'useItem', actor: 'hero', item: 'bread' });
    expect(pools(w).satiation!.current).toBe(10); // 2 + 8, clamped to max 10
  });
});
