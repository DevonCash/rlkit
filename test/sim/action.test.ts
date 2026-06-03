import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { resolve } from '../../src/sim/action';
import type { Effect } from '../../src/core/action';
import { get } from '../../src/core/entity';
import type { Position } from '../../src/core/component';
import { makeWorld, makeLevel, spawnAt, handlers } from './helpers';

describe('resolve — outcomes (§22.5)', () => {
  it('reject: no time passes, no effects, world unchanged', () => {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 5, 5));
    spawnAt(w, 'hero', 'L', 0, 0);
    const before = get<Position>(w.state.entities.get('hero')!, 'position')!;

    const out = resolve(w, { type: 'move', actor: 'hero', dir: { x: -1, y: 0 } }); // off the edge
    expect(out.status).toBe('rejected');
    const after = get<Position>(w.state.entities.get('hero')!, 'position')!;
    expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y });
  });

  it('done: effects apply and events are returned', () => {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 5, 5));
    spawnAt(w, 'hero', 'L', 1, 1);

    const out = resolve(w, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } });
    expect(out.status).toBe('done');
    if (out.status === 'done') {
      expect(out.cost).toBe(w.services.config.baseActionCost);
      expect(out.events).toEqual([{ type: 'moved', entity: 'hero', from: 6, to: 7 }]);
    }
    expect(get<Position>(w.state.entities.get('hero')!, 'position')!.x).toBe(2);
  });

  it('fizzle: cost is spent and queued effects still apply', () => {
    const w = makeWorld();
    let applied = false;
    handlers(w).register('try', (ctx) => {
      ctx.push({ validate: () => true, apply: () => ((applied = true), []) });
      ctx.fizzle('tried but failed');
    });
    const out = resolve(w, { type: 'try', actor: 'x' });
    expect(out.status).toBe('fizzled');
    if (out.status === 'fizzled') expect(out.cost).toBe(w.services.config.baseActionCost);
    expect(applied).toBe(true); // queued effect applied despite the fizzle
  });

  it('unknown action type is rejected, never thrown (ts-pattern catch-all)', () => {
    const w = makeWorld();
    expect(() => resolve(w, { type: 'frobnicate', actor: 'x' })).not.toThrow();
    expect(resolve(w, { type: 'frobnicate', actor: 'x' }).status).toBe('rejected');
  });

  it('upstream sees a frozen ReadonlyWorld (runtime guard)', () => {
    const w = makeWorld();
    let frozen = false;
    handlers(w).register('peek', (ctx) => {
      frozen = Object.isFrozen(ctx.world);
      expect(() => {
        (ctx.world as { state: unknown }).state = {};
      }).toThrow();
    });
    resolve(w, { type: 'peek', actor: 'x' });
    expect(frozen).toBe(true);
  });
});

describe('resolve — validate-all-then-apply atomicity (§22.5, headline)', () => {
  test.prop([fc.array(fc.boolean(), { minLength: 1, maxLength: 8 })])(
    'if any effect fails validate, none apply',
    (validities) => {
      const w = makeWorld();
      const applied: number[] = [];
      handlers(w).register('batch', (ctx) => {
        validities.forEach((ok, i) => {
          const eff: Effect = {
            kind: `e${i}`,
            validate: () => ok,
            apply: () => (applied.push(i), []),
          };
          ctx.push(eff);
        });
      });

      const out = resolve(w, { type: 'batch', actor: 'x' });
      if (validities.every(Boolean)) {
        expect(out.status).toBe('done');
        expect(applied).toEqual(validities.map((_, i) => i)); // all applied, in order
      } else {
        expect(out.status).toBe('rejected');
        expect(applied).toEqual([]); // atomicity: none applied
      }
    },
  );
});

describe('resolve — determinism (§22.5)', () => {
  test.prop([
    fc.integer(),
    fc.array(fc.constantFrom('move', 'wait'), { minLength: 1, maxLength: 30 }),
  ])('same seed + same commands → identical event stream', (seed, cmds) => {
    const run = () => {
      const w = makeWorld(seed);
      w.state.levels.set('L', makeLevel('L', 8, 8));
      spawnAt(w, 'hero', 'L', 4, 4);
      const events: unknown[] = [];
      for (const type of cmds) {
        const out = resolve(w, { type, actor: 'hero', dir: { x: 1, y: 0 } });
        if (out.status !== 'rejected') events.push(...out.events);
      }
      return events;
    };
    expect(run()).toEqual(run());
  });
});
