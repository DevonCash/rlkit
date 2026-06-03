/**
 * producers/goal — Dijkstra goal maps (§11.3.2).
 *
 * `recompute` runs a multi-source BFS from all goal cells at once: each passable
 * cell ends up holding step-distance to the nearest goal; walls and unreachable
 * cells stay `+Infinity`. Rolling downhill reaches the nearest goal optimally.
 *
 * Flee/safety (`mode:'flee'`) is the Brogue recipe: scale the threat map by a
 * negative coefficient, then re-Dijkstra the scaled map to a fixed point so the
 * gradient leads fleers toward exits instead of into corners (§22.11). Added in
 * group 3.
 */
import type { FieldProducer, FieldCtx } from '../../../core/fields';
import { neighbors4, neighbors8, type Cell } from '../../../core/coords';

export interface GoalParams {
  /** 'goal' = head toward the goals; 'flee' = head away (re-Dijkstra). */
  mode?: 'goal' | 'flee';
  /** Negative coefficient for flee scaling (default from config at the edge). */
  fleeCoefficient?: number;
}

function neighborsOf(cell: Cell, ctx: FieldCtx): Cell[] {
  return ctx.diagonals
    ? neighbors8(cell, ctx.width, ctx.height)
    : neighbors4(cell, ctx.width, ctx.height);
}

/** Multi-source BFS relaxation; `out` already holds initial potentials. */
function dijkstra(out: Float32Array, ctx: FieldCtx, seeds: Iterable<Cell>): void {
  const queue: Cell[] = [];
  for (const s of seeds) queue.push(s);
  let head = 0;
  while (head < queue.length) {
    const c = queue[head++]!;
    const next = out[c]! + 1;
    for (const nb of neighborsOf(c, ctx)) {
      if (ctx.passable(nb) && next < out[nb]!) {
        out[nb] = next;
        queue.push(nb);
      }
    }
  }
}

export const goalProducer: FieldProducer<GoalParams> = {
  kind: 'goal',
  recompute(out, ctx, params) {
    out.fill(Number.POSITIVE_INFINITY);
    const goals: Cell[] = [];
    for (const g of ctx.goalCells()) {
      if (ctx.passable(g)) {
        out[g] = 0;
        goals.push(g);
      }
    }
    dijkstra(out, ctx, goals);

    if (params.mode === 'flee') {
      const coef = params.fleeCoefficient ?? -1.2;
      // Scale finite cells by the negative coefficient, then re-relax to a fixed
      // point so low values propagate and the gradient points to open space.
      const reseed: Cell[] = [];
      for (let i = 0; i < out.length; i++) {
        if (Number.isFinite(out[i]!) && ctx.passable(i)) {
          out[i] = out[i]! * coef;
          reseed.push(i);
        }
      }
      dijkstra(out, ctx, reseed);
    }
  },
};
