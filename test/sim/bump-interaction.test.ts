/**
 * Bump-interaction dispatch (§7.2, R7): priority + tiebreak, fall-through, the
 * BLOCK sentinel, swap precedence, and that the redirect carries the
 * interaction's own cost. The engine ships a default attack-on-bump rule (prio 0).
 */
import { describe, it, expect } from 'vitest';
import { makeWorld, makeLevel, spawnAt, handlers } from './helpers';
import { perform } from '../../src/sim/action';
import { BLOCK } from '../../src/core/bump';
import type { ActionHandler } from '../../src/core/action';

/** Hero at (1,1), a plain (non-swappable, non-passable) occupant east at (2,1). */
function bumpScene(allyTarget = false) {
  const w = makeWorld();
  w.state.levels.set('L', makeLevel('L', 4, 3));
  const hero = spawnAt(w, 'hero', 'L', 1, 1);
  spawnAt(w, 'obj', 'L', 2, 1);
  if (allyTarget) {
    hero.components.set('allegiance', { type: 'allegiance', faction: 'player', overrides: { obj: 'allied' } });
  }
  const bumpEast = () => perform(w, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } });
  return { w, bumpEast };
}

describe('bump-interaction dispatch (§7.2, R7)', () => {
  it('a higher-priority rule wins; redirect carries its action and cost; bumped still fires', () => {
    const { w, bumpEast } = bumpScene();
    const zap: ActionHandler = (ctx) => {
      ctx.cost = 250;
      ctx.push({ kind: 'zapped', validate: () => true, apply: () => [{ type: 'zapped', by: ctx.action.actor }] });
    };
    handlers(w).register('zap', zap);
    w.services.bumpInteractions.register({ priority: 10, claim: (c) => ({ type: 'zap', actor: c.actor, target: c.target }) });

    const out = bumpEast();
    expect(out.status).toBe('done');
    expect(out.status === 'done' && out.cost).toBe(250); // the interaction's cost, not a base move
    if (out.status === 'done') {
      expect(out.events.some((e) => e.type === 'bumped')).toBe(true);
      expect(out.events.some((e) => e.type === 'zapped')).toBe(true);
    }
  });

  it('a high-priority decline (undefined) falls through to the default attack rule', () => {
    const { w, bumpEast } = bumpScene();
    let asked = false;
    w.services.bumpInteractions.register({ priority: 99, claim: () => { asked = true; return undefined; } });
    const out = bumpEast(); // default attack rule (prio 0) claims → attack on a no-hp target → rejected
    expect(asked).toBe(true);
    expect(out.status).toBe('rejected'); // attack effect fails validation (no hp pool)
  });

  it('BLOCK suppresses lower-priority rules (intent-based opt-out)', () => {
    const { w, bumpEast } = bumpScene();
    w.services.bumpInteractions.register({ priority: 5, claim: () => BLOCK });
    const out = bumpEast();
    expect(out.status).toBe('fizzled'); // blocked — the default attack never runs
  });

  it('an unclaimed bump (e.g. allied target, no other rule) is blocked', () => {
    const { bumpEast } = bumpScene(true); // target is allied → default attack declines
    expect(bumpEast().status).toBe('fizzled');
  });

  it('swap still precedes the interaction channel', () => {
    const w = makeWorld();
    w.state.levels.set('L', makeLevel('L', 4, 3));
    spawnAt(w, 'hero', 'L', 1, 1);
    spawnAt(w, 'pal', 'L', 2, 1, ['swappable']);
    let asked = false;
    w.services.bumpInteractions.register({ priority: 99, claim: () => { asked = true; return BLOCK; } });
    const out = perform(w, { type: 'move', actor: 'hero', dir: { x: 1, y: 0 } });
    expect(out.status).toBe('done'); // swapped, not blocked
    expect(asked).toBe(false); // the channel was never consulted for a swappable occupant
  });
});
