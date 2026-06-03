import { describe, it, expect } from 'vitest';
import { resolve, perform } from '../../src/sim/action';
import type { Effect } from '../../src/core/action';
import type { Mixin } from '../../src/core/mixin';
import type { Reactor } from '../../src/core/reactor';
import type { GameEvent } from '../../src/core/events';
import { makeWorld, makeLevel, spawnAt, handlers } from './helpers';

// A synthetic mutable damage effect (combat proper is M4 — this exercises the
// M2 reactor mechanism through public APIs).
function damageEffect(target: string, amount: number): Effect & { amount: number } {
  return {
    kind: 'damage',
    amount,
    validate: () => true,
    apply(): GameEvent[] {
      return [{ type: 'damaged', entity: target, amount: this.amount }];
    },
  };
}

function registerMixin(world: ReturnType<typeof makeWorld>, m: Mixin): void {
  (world.services.registries.mixins as { register(id: string, def: Mixin): void }).register(m.name, m);
}

describe('reactors — pre-phase (onAction) (§22.6)', () => {
  it('an armor reactor reduces a pending damage effect', () => {
    const w = makeWorld();
    // 'hit' pushes a damage effect against the action's target.
    handlers(w).register('hit', (ctx) => {
      const target = (ctx.action as { target?: string }).target!;
      ctx.push(damageEffect(target, 5));
    });
    // The defender's armor mixin reduces any pending damage by 3 (pre-phase).
    registerMixin(w, {
      name: 'armored',
      requires: [],
      onAction(ctx) {
        for (const eff of ctx.effects) {
          if (eff.kind === 'damage') {
            const d = eff as Effect & { amount: number };
            d.amount = Math.max(0, d.amount - 3);
          }
        }
      },
    });

    w.state.entities.set('atk', { id: 'atk', components: new Map(), mixins: [] });
    w.state.entities.set('def', { id: 'def', components: new Map(), mixins: ['armored'] });

    const out = resolve(w, { type: 'hit', actor: 'atk', target: 'def' });
    expect(out.status).toBe('done');
    if (out.status === 'done') {
      expect(out.events).toEqual([{ type: 'damaged', entity: 'def', amount: 2 }]);
    }
  });
});

describe('reactors — post-phase (onEvent) (§22.6)', () => {
  it('a post reactor enqueues a follow-up action, resolved via the loop', () => {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 6, 6));
    spawnAt(w, 'hero', 'L', 1, 1);

    const seen: string[] = [];
    w.services.bus.on('followed', () => seen.push('followed'));

    // 'note' emits a 'followed' event.
    handlers(w).register('note', (ctx) => {
      ctx.push({ kind: 'note', validate: () => true, apply: () => [{ type: 'followed' }] });
    });
    // Global post reactor: every 'moved' enqueues a 'note' follow-up action.
    const reactor: Reactor = {
      on: 'moved',
      scope: 'global',
      phase: 'post',
      react: () => [{ type: 'note', actor: 'hero' }],
    };
    w.services.reactors.register(reactor);

    perform(w, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } });
    expect(seen).toEqual(['followed']); // the follow-up action ran via the cascade
  });
});

describe('reactors — scope dispatch (§22.6)', () => {
  it('an entity reactor fires only for its entity; global fires always; zone is a no-op', () => {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 8, 8));
    spawnAt(w, 'A', 'L', 1, 1, ['watcher']);
    spawnAt(w, 'B', 'L', 5, 5);

    let watcherFired = 0;
    let globalFired = 0;
    let zoneFired = 0;

    // Entity reactor (mixin onEvent) — fires only for events whose entity is A.
    registerMixin(w, {
      name: 'watcher',
      requires: [],
      onEvent(ev) {
        if (ev.type === 'moved') watcherFired++;
      },
    });
    w.services.reactors.register({
      on: 'moved',
      scope: 'global',
      phase: 'post',
      react: () => {
        globalFired++;
      },
    });
    // Zone-scoped reactor: accepted but never dispatched until M11.
    w.services.reactors.register({
      on: 'moved',
      scope: 'zone',
      phase: 'post',
      react: () => {
        zoneFired++;
      },
    });

    perform(w, { type: 'move', actor: 'A', dir: { x: 1, y: 0 } });
    expect(watcherFired).toBe(1); // A moved → A's watcher fired
    expect(globalFired).toBe(1);

    perform(w, { type: 'move', actor: 'B', dir: { x: -1, y: 0 } });
    expect(watcherFired).toBe(1); // B moved → A's watcher did NOT fire
    expect(globalFired).toBe(2); // global fires regardless

    expect(zoneFired).toBe(0); // zone scope never dispatched in M2
  });
});
