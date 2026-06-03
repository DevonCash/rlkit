/**
 * desire-ai — weighted-desire field AI (§11.3.5).
 *
 * Each turn the mixin resolves the actor's composite (Σ weightᵢ·fieldᵢ) over its
 * per-level field store, scans the candidate neighbors, steps to the lowest
 * weighted-sum neighbor, and breaks ties on the seeded RNG. Desires are data
 * (they may change at runtime); the summation is the logic. A field of any kind
 * — goal, scent, influence — is just a `fieldId` in the list.
 *
 * Returns `move` (consistent with aiHunter): stepping into the goal cell becomes
 * an attack via the move handler's redirect.
 */
import { get, type Entity } from '../../core/entity';
import type { Position, DesireAIData } from '../../core/component';
import type { Mixin } from '../../core/mixin';
import type { Action } from '../../core/action';
import type { FieldDescriptor, DesireProfile } from '../../core/fields';
import type { Registry } from '../../core/registry';
import type { ReadonlyWorld } from '../../core/world';
import { cellOf, neighbors4, neighbors8, type Cell } from '../../core/coords';
import { isWalkable } from '../../core/level';

export const desireAiMixin: Mixin = {
  name: 'desire-ai',
  requires: ['position', 'desire-ai'],
  takeTurn(self: Entity, world: ReadonlyWorld): Action | undefined {
    const data = get<DesireAIData>(self, 'desire-ai');
    const pos = get<Position>(self, 'position');
    if (!data || !pos || data.desires.length === 0) return undefined;
    const level = world.state.levels.get(pos.levelId);
    if (!level) return undefined;

    const store = world.services.fields.forLevel(pos.levelId);
    const fieldReg = world.services.registries.fields as Registry<FieldDescriptor> | undefined;
    for (const d of data.desires) {
      const desc = fieldReg?.tryGet(d.fieldId);
      if (desc) store.ensure(desc);
    }

    const composite = store.composite(data.desires as DesireProfile);
    const here = cellOf({ x: pos.x, y: pos.y }, level.width);
    const palette = world.services.tiles;
    const nbs = (self.mixins.includes('diagonal') ? neighbors8 : neighbors4)(
      here,
      level.width,
      level.height,
    );

    // Lowest-composite walkable neighbor that strictly improves on the current cell.
    let best = composite[here]!;
    let ties: Cell[] = [];
    for (const nb of nbs) {
      if (!isWalkable(level, nb, palette)) continue;
      const v = composite[nb]!;
      if (v < best) {
        best = v;
        ties = [nb];
      } else if (v === best && ties.length > 0) {
        ties.push(nb);
      }
    }
    if (ties.length === 0) return undefined; // already at the local optimum

    const target = ties.length === 1 ? ties[0]! : world.services.rng.pick(ties);
    const tx = target % level.width;
    const ty = (target / level.width) | 0;
    return { type: 'move', actor: self.id, dir: { x: Math.sign(tx - pos.x), y: Math.sign(ty - pos.y) } };
  },
};
