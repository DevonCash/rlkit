/**
 * config/defaults — all default configurable values in one place (§17, §3).
 *
 * Per the config-vs-logic pillar, numbers, costs, colors, glyphs, speeds,
 * rates, and content tables live here (or in registries), never hardcoded in
 * rules. This is a placeholder; values land with the systems that read them.
 */

export interface Config {
  /** turns → energy conversion helper baseline (decision §21.2). */
  readonly energyPerTurn: number;
}

export const defaultConfig: Config = {
  energyPerTurn: 100,
};
