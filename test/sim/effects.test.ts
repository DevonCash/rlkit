import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/index';
import type { TimerEffectRegistry } from '../../src/sim/effects';
import { runReactions } from '../../src/sim/action';
import type { TimerEffect } from '../../src/core/action';
import type { GameEvent } from '../../src/core/events';
import { defaultConfig } from '../../src/config/defaults';

// The public createWorld already registers core timer-effects ('pulse') at the edge.
function world() {
  return createWorld({ config: defaultConfig, rng: 1 });
}
function timerReg(w: ReturnType<typeof world>) {
  return w.services.registries.timerEffects as TimerEffectRegistry;
}

describe('timer-effects registry (§11A.4)', () => {
  it('schedules an effect by name; the timeline yields it at its fireAt', () => {
    const w = world();
    w.services.timeline.addActor('hero', w.services.config.baseActionCost);
    const id = w.services.timeline.schedule(3, 'pulse', { n: 7 });
    expect(typeof id).toBe('number');

    // Pump the timeline until the effect entry comes due.
    let fired: { effectId: string; payload?: unknown } | undefined;
    for (let i = 0; i < 20; i++) {
      const entry = w.services.timeline.next();
      if (entry.kind === 'effect') {
        fired = entry;
        break;
      }
      w.services.timeline.reschedule(entry.id, w.services.config.baseActionCost);
    }
    expect(fired).toMatchObject({ effectId: 'pulse', payload: { n: 7 } });
    expect(w.services.timeline.worldClock).toBe(3);
  });

  it('resolves a fired effect through the registry and runs its events via the loop', () => {
    const w = world();
    const seen: GameEvent[] = [];
    w.services.bus.on('pulse', (ev) => seen.push(ev));

    const effect = timerReg(w).get('pulse') as TimerEffect;
    const events = effect(w, { n: 7 });
    runReactions(w, events); // what the driver does on an effect entry

    expect(seen).toEqual([{ type: 'pulse', payload: { n: 7 } }]);
  });
});
