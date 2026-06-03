/**
 * producers/influence — tactical pressure maps (§11.3.2).
 *
 * Each source stamps its strength with distance falloff (a bounded BFS over
 * passable cells); contributions sum. Threats use negative strength, allies
 * positive, so the field encodes how contested/dangerous each cell is — used for
 * threat avoidance, territory, and pack spacing. Falloff radius + strength are
 * config (via descriptor params).
 */
import type { FieldProducer, FieldCtx } from '../../../core/fields';
import { neighbors4, neighbors8, type Cell } from '../../../core/coords';

export interface InfluenceParams {
  /** Per-source strength; negative for threats, positive for allies. */
  strength?: number;
  falloffRadius?: number;
}

function neighborsOf(c: Cell, ctx: FieldCtx): Cell[] {
  return ctx.diagonals ? neighbors8(c, ctx.width, ctx.height) : neighbors4(c, ctx.width, ctx.height);
}

export const influenceProducer: FieldProducer<InfluenceParams> = {
  kind: 'influence',
  recompute(out, ctx, params) {
    out.fill(0);
    const strength = params.strength ?? 1;
    const radius = Math.max(1, params.falloffRadius ?? 6);

    // Bounded BFS from each source; contribution falls off linearly to the radius.
    const dist = new Int32Array(out.length);
    for (const src of ctx.goalCells()) {
      if (!ctx.passable(src)) continue;
      dist.fill(-1);
      dist[src] = 0;
      const queue: Cell[] = [src];
      let head = 0;
      while (head < queue.length) {
        const c = queue[head++]!;
        const d = dist[c]!;
        out[c]! += strength * (1 - d / radius);
        if (d >= radius) continue;
        for (const nb of neighborsOf(c, ctx)) {
          if (dist[nb] === -1 && ctx.passable(nb)) {
            dist[nb] = d + 1;
            queue.push(nb);
          }
        }
      }
    }
  },
};
