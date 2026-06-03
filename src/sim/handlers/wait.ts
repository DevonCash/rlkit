/**
 * wait — the wait action handler (§7.4).
 *
 * Spends the turn doing nothing: no effects, no reject/fizzle, so the action
 * resolves `done` with its energy cost. The simplest possible turn-taker.
 */
/**
 * A no-op handler: cost is spent, no effects pushed. A zero-arg function is
 * assignable to `ActionHandler`.
 */
export function waitHandler(): void {
  // Intentionally empty.
}
