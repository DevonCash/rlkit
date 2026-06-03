/**
 * config/defaults — all default configurable values in one place (§17, §3).
 *
 * Per the config-vs-logic pillar, numbers, costs, colors, glyphs, speeds,
 * rates, and content tables live here (or in registries), never hardcoded in
 * rules. Values land with the systems that read them.
 */

export interface Config {
  /** turns → energy conversion helper baseline (decision §21.2). */
  readonly energyPerTurn: number;
  /** Default energy cost of an action (§7.1). */
  readonly baseActionCost: number;
  /** Energy an actor accrues per world tick when no per-actor speed is set (§7.1). */
  readonly defaultSpeed: number;
  /** Max reaction-loop drain iterations before the depth guard trips (§7.3). */
  readonly maxReactionDepth: number;
}

export const defaultConfig: Config = {
  energyPerTurn: 100,
  baseActionCost: 100,
  defaultSpeed: 10,
  maxReactionDepth: 64,
};
