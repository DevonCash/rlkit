/**
 * timeline — the unified timeline service (§7.1, §7.3).
 *
 * One structure holds both actor turns (recurring, energy-based) and one-shot
 * delayed effects, ordered by fire time. The service operates on the
 * serializable `TimelineState`; the implementation lives here in `sim` while
 * the `Timeline` interface lives in `core` so `Services` can name it without a
 * `sim` import (injected at the edge, like the RNG).
 *
 * Energy model: every actor accrues `speed` energy per world tick and may act
 * when `energy >= 0`; acting subtracts the action `cost`. Granting energy to
 * *all* actors each tick is what guarantees no actor is starved.
 *
 * Two clocks (§7.3): the WORLD clock advances once per global turn (delayed
 * effects + environmental fields key off it); each actor's PER-ACTOR clock
 * advances on its own turns (status/regen/cooldowns key off it), so a hasted
 * actor takes more per-actor ticks per world turn.
 */
import type { Config } from '../config/defaults';
import type { EntityId } from '../core/entity';
import type { Timeline, TimelineState, Entry, TimerId } from '../core/world';

export function createTimeline(state: TimelineState, config: Config): Timeline {
  const findActor = (id: EntityId) => state.actors.find((a) => a.id === id);

  /** World ticks until an actor is ready (`energy >= 0`); 0 if ready now. */
  const ticksUntilReady = (energy: number, speed: number): number =>
    energy >= 0 ? 0 : Math.ceil(-energy / speed);

  /** Advance the world clock by `delta`, accruing `speed` to every actor. */
  const advance = (delta: number): void => {
    if (delta <= 0) return;
    state.worldClock += delta;
    for (const a of state.actors) a.energy += a.speed * delta;
  };

  return {
    addActor(id, speed) {
      if (findActor(id)) return;
      state.actors.push({
        id,
        energy: 0,
        speed: speed ?? config.defaultSpeed,
        clock: 0,
      });
    },

    remove(id) {
      const i = state.actors.findIndex((a) => a.id === id);
      if (i >= 0) state.actors.splice(i, 1);
    },

    schedule(delay, effectId, payload) {
      const seq = state.nextSeq++;
      state.timers.push({
        fireAt: state.worldClock + Math.max(0, delay),
        effectId,
        ...(payload === undefined ? {} : { payload }),
        seq,
      });
      return seq;
    },

    cancel(id: TimerId) {
      const i = state.timers.findIndex((t) => t.seq === id);
      if (i >= 0) state.timers.splice(i, 1);
    },

    next(): Entry {
      if (state.actors.length === 0 && state.timers.length === 0) {
        throw new Error('Timeline.next: no actors or timers scheduled');
      }

      // Soonest world tick at which any actor becomes ready.
      let actorDue = Infinity;
      for (const a of state.actors) {
        actorDue = Math.min(actorDue, state.worldClock + ticksUntilReady(a.energy, a.speed));
      }
      // Soonest world tick at which any timer fires (already-due → now).
      let timerDue = Infinity;
      for (const t of state.timers) {
        timerDue = Math.min(timerDue, Math.max(t.fireAt, state.worldClock));
      }

      const due = Math.min(actorDue, timerDue);
      advance(due - state.worldClock);

      // Tie-break at the due tick: effects before actors, then seq / EntityId.
      if (timerDue === due) {
        let chosen = -1;
        for (let i = 0; i < state.timers.length; i++) {
          const t = state.timers[i]!;
          if (Math.max(t.fireAt, state.worldClock) !== due) continue;
          if (chosen < 0 || t.seq < state.timers[chosen]!.seq) chosen = i;
        }
        const [fired] = state.timers.splice(chosen, 1);
        return fired!.payload === undefined
          ? { kind: 'effect', effectId: fired!.effectId }
          : { kind: 'effect', effectId: fired!.effectId, payload: fired!.payload };
      }

      // Otherwise an actor: the ready one with the smallest EntityId.
      let best: { id: EntityId } | undefined;
      for (const a of state.actors) {
        if (a.energy >= 0 && (best === undefined || a.id < best.id)) best = a;
      }
      return { kind: 'actor', id: best!.id };
    },

    reschedule(id, cost) {
      const a = findActor(id);
      if (!a) throw new Error(`Timeline.reschedule: unknown actor "${id}"`);
      a.energy -= cost;
      a.clock += 1;
    },

    get worldClock() {
      return state.worldClock;
    },

    clockOf(id) {
      return findActor(id)?.clock ?? 0;
    },
  };
}
