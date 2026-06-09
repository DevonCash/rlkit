/**
 * stepper — the sanctioned per-world-tick bulk-step slot (§7.1, R1).
 *
 * `registerStepper` lets a game run a whole-grid update over a named Float32
 * layer on a fixed cadence (in world-ticks), as a single coarse step inside the
 * normal effect→event pipeline. It is a thin layer over the existing
 * timer-effect + timeline machinery: a recurring, serialize-by-name timer-effect
 * `stepper:<id>` that the timeline already orders deterministically against
 * actors and other timers (effects before actors at a tie, then by seq).
 *
 * This file contains NO domain math. The game supplies `step` (e.g. conservative
 * atmosphere diffusion reading the composed `flags` layer's airtight bit); the
 * engine supplies the slot, the cadence, the ordering, and the layer lifecycle.
 *
 * Save/load: the timer survives in `TimelineState` by `effectId`, but its
 * *function* does not serialize — so the game must re-call `registerStepper`
 * after `loadWorld` (like `levelProvider`/`makeFields`). The bootstrap is
 * idempotent: it seeds the first timer only if none with that `effectId` already
 * exists, so re-registering on load re-attaches the function without
 * double-scheduling.
 */
import type { World } from '../core/world';
import type { Level } from '../core/level';
import type { GameEvent } from '../core/events';
import type { TimerEffect } from '../core/action';
import { timerEffectRegistryOf } from './effects';

export interface Stepper {
  /** Stable id; the timer-effect is registered as `stepper:<id>`. */
  id: string;
  /** The Float32 layer this stepper sweeps; a level without it is skipped (the
   *  game initializes the layer on the levels it wants simulated). */
  layer: string;
  /** World-ticks between runs (must be ≥ 1). */
  cadence: number;
  /** Bulk update for ONE level: rewrite `data` in place; return events to emit. */
  step: (world: World, level: Level, data: Float32Array) => GameEvent[];
}

/** Register (or re-register, on load) a per-world-tick bulk stepper. */
export function registerStepper(world: World, stepper: Stepper): void {
  const { id, layer: layerName, cadence, step } = stepper;
  if (!Number.isInteger(cadence) || cadence < 1) {
    throw new Error(`registerStepper("${id}"): cadence must be an integer ≥ 1`);
  }
  const effectId = `stepper:${id}`;
  const reg = timerEffectRegistryOf(world);
  const timeline = world.services.timeline;

  const run: TimerEffect = (w) => {
    const events: GameEvent[] = [];
    // Step only levels that already carry the layer — the game initializes it on
    // the levels it wants simulated (e.g. pressure on station floors), so the
    // stepper never force-creates the layer on irrelevant levels.
    for (const level of w.state.levels.values()) {
      const data = level.layers.get(layerName);
      if (!(data instanceof Float32Array)) continue;
      const out = step(w, level, data);
      if (out.length > 0) events.push(...out);
    }
    timeline.schedule(cadence, effectId); // recur at +cadence
    return events;
  };
  // `override` (not `register`) so re-registering on load replaces the closure
  // rather than throwing on the duplicate id.
  reg.override(effectId, run);

  // Idempotent bootstrap: schedule the first run only if not already scheduled.
  if (!world.state.timeline.timers.some((t) => t.effectId === effectId)) {
    timeline.schedule(cadence, effectId);
  }
}
