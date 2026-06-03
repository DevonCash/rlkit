/**
 * rlkit — public API surface (§18).
 *
 * Pre-code skeleton: the engine is built milestone-by-milestone (§20) behind
 * this entry point. For now it exports the package version and the default
 * config so the build, types, and tests have a real surface to verify.
 */

export type { Config } from './config/defaults';
export { defaultConfig } from './config/defaults';

export const version = '0.0.0';
