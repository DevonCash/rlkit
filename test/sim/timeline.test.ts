import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { createTimeline } from '../../src/sim/timeline';
import { emptyTimelineState } from '../../src/core/world';
import { defaultConfig } from '../../src/config/defaults';
import type { Entry } from '../../src/core/world';

function tl() {
  const state = emptyTimelineState();
  return { state, timeline: createTimeline(state, defaultConfig) };
}

/** Drive N actor turns, counting how often each actor acts (rescheduling at base cost). */
function runActorTurns(
  timeline: ReturnType<typeof createTimeline>,
  turns: number,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (let i = 0; i < turns; i++) {
    const e = timeline.next();
    if (e.kind === 'actor') {
      counts[e.id] = (counts[e.id] ?? 0) + 1;
      timeline.reschedule(e.id, defaultConfig.baseActionCost);
    }
  }
  return counts;
}

describe('timeline — energy model & cadence', () => {
  it('a double-speed actor acts ~twice as often', () => {
    const { timeline } = tl();
    timeline.addActor('slow', 10);
    timeline.addActor('fast', 20);
    const counts = runActorTurns(timeline, 6000);
    const ratio = counts.fast! / counts.slow!;
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.2);
  });

  test.prop([
    fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 2, maxLength: 5 }),
  ])('no actor is ever starved', (speeds) => {
    const { timeline } = tl();
    speeds.forEach((s, i) => timeline.addActor(`a${i}`, s));
    const counts = runActorTurns(timeline, 4000);
    // Every actor acts at least once over a long run.
    for (let i = 0; i < speeds.length; i++) {
      expect(counts[`a${i}`] ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('timeline — delayed effects', () => {
  it('a scheduled effect fires exactly at its fireAt on the world clock', () => {
    const { timeline } = tl();
    timeline.addActor('hero', defaultConfig.baseActionCost); // acts every world tick
    timeline.schedule(3, 'boom');

    const fired: Entry[] = [];
    // Pump entries; reschedule actors, collect effects, until the effect fires.
    for (let i = 0; i < 20; i++) {
      const e = timeline.next();
      if (e.kind === 'effect') {
        fired.push(e);
        break;
      }
      timeline.reschedule(e.id, defaultConfig.baseActionCost);
    }
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ kind: 'effect', effectId: 'boom' });
    expect(timeline.worldClock).toBe(3);
  });

  it('cancel prevents an effect from firing', () => {
    const { timeline } = tl();
    const id = timeline.schedule(2, 'boom');
    timeline.addActor('hero', defaultConfig.baseActionCost);
    timeline.cancel(id);

    for (let i = 0; i < 10; i++) {
      const e = timeline.next();
      expect(e.kind).not.toBe('effect');
      if (e.kind === 'actor') timeline.reschedule(e.id, defaultConfig.baseActionCost);
    }
  });

  it('breaks ties deterministically: effects before actors, then by seq', () => {
    const { timeline } = tl();
    timeline.addActor('hero', defaultConfig.baseActionCost);
    // Two effects due at the same tick; lower seq fires first, before the actor.
    timeline.schedule(0, 'first');
    timeline.schedule(0, 'second');
    const a = timeline.next();
    expect(a).toMatchObject({ kind: 'effect', effectId: 'first' });
    const b = timeline.next();
    expect(b).toMatchObject({ kind: 'effect', effectId: 'second' });
    const c = timeline.next();
    expect(c).toMatchObject({ kind: 'actor', id: 'hero' });
  });

  it('carries a payload through to the fired entry', () => {
    const { timeline } = tl();
    timeline.schedule(0, 'spawn', { what: 'goblin' });
    timeline.addActor('hero');
    expect(timeline.next()).toEqual({ kind: 'effect', effectId: 'spawn', payload: { what: 'goblin' } });
  });
});

describe('timeline — two clocks', () => {
  it('a faster actor advances its per-actor clock more per world turn', () => {
    const { timeline } = tl();
    timeline.addActor('slow', 10);
    timeline.addActor('fast', 20);
    runActorTurns(timeline, 6000);
    // The per-actor clock counts that actor's own turns — faster ⇒ more ticks.
    const fastClock = timeline.clockOf('fast');
    const slowClock = timeline.clockOf('slow');
    expect(fastClock).toBeGreaterThan(slowClock);
    expect(fastClock / slowClock).toBeGreaterThan(1.8);
  });

  it('reschedule throws for an unknown actor', () => {
    const { timeline } = tl();
    expect(() => timeline.reschedule('ghost', 100)).toThrow(/unknown actor/);
  });

  it('next throws when nothing is scheduled', () => {
    const { timeline } = tl();
    expect(() => timeline.next()).toThrow(/no actors or timers/);
  });
});
