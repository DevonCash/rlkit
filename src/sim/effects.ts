/**
 * effects — timeline timer-effects (§11A.4).
 *
 * Delayed effects scheduled on the timeline (`schedule(delay, effectId, payload)`)
 * are stored by *name*; when the timer comes due the driver resolves `effectId`
 * here and runs the returned events through the reaction loop. Serialize-by-name
 * (§6.3), like statuses and consumable effects — no closures in state.
 */
import type { TimerEffect } from '../core/action';
import type { Registry } from '../core/registry';

export type { TimerEffect } from '../core/action';
export type TimerEffectRegistry = Registry<TimerEffect>;

/**
 * Register the batteries-included timer-effects (overridable content). Ships one
 * proof effect: a `pulse` that emits a `pulse` event carrying its payload when
 * its scheduled timer fires.
 */
export function registerCoreTimerEffects(reg: TimerEffectRegistry): void {
  reg.register('pulse', (_world, payload) => [{ type: 'pulse', payload }]);
}
