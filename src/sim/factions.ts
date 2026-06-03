/**
 * factions — allegiance + stance resolution (§11A.2).
 *
 * A configurable hostility matrix plus per-entity overrides (charm/fear/grudge).
 * `stanceBetween(world, a, b)` answers "how does a regard b" — a's override for
 * b's id wins, else the faction matrix, else the configured default. Stance is
 * directional: overrides (and the matrix) need not be symmetric. The field AI's
 * goal sets (M6b) read this to build threat/ally fields.
 */
import { get, type Entity } from '../core/entity';
import type { Allegiance, Stance } from '../core/component';
import type { ReadonlyWorld } from '../core/world';

export type { Stance } from '../core/component';
export type FactionId = string;

/** How entity `a` regards entity `b`. */
export function stanceBetween(world: ReadonlyWorld, a: Entity, b: Entity): Stance {
  const aa = get<Allegiance>(a, 'allegiance');
  const cfg = world.services.config.factions;
  if (!aa) return cfg.default;

  const override = aa.overrides?.[b.id];
  if (override) return override;

  const bb = get<Allegiance>(b, 'allegiance');
  if (!bb) return cfg.default;

  return cfg.matrix[aa.faction]?.[bb.faction] ?? cfg.default;
}
