/**
 * producers/scent — temporal scent trails (§11.3.2).
 *
 * Each turn: deposit at source cells, decay all cells by a factor, then diffuse
 * into neighbors — **wall-aware**: scent does not bleed through a non-transparent
 * (opaque) tile. Rolling uphill follows a cooling trail to where a target
 * *went*, not where it *is*. Deposit/decay/diffusion are config (passed via the
 * descriptor params). Diffusion double-buffers through the store-owned scratch.
 */
import type { FieldProducer, FieldCtx } from '../../../core/fields';
import { neighbors4, neighbors8, type Cell } from '../../../core/coords';

export interface ScentParams {
  deposit?: number;
  decay?: number;
  diffusion?: number;
}

function neighborsOf(c: Cell, ctx: FieldCtx): Cell[] {
  return ctx.diagonals ? neighbors8(c, ctx.width, ctx.height) : neighbors4(c, ctx.width, ctx.height);
}

export const scentProducer: FieldProducer<ScentParams> = {
  kind: 'scent',
  recompute(out) {
    out.fill(0); // scent starts empty and accumulates via step()
  },
  step(out, ctx, params) {
    const deposit = params.deposit ?? 1;
    const decay = params.decay ?? 0.9;
    const diffusion = params.diffusion ?? 0.2;

    for (const s of ctx.goalCells()) if (ctx.transparent(s)) out[s]! += deposit;
    for (let i = 0; i < out.length; i++) out[i]! *= decay;

    const prev = ctx.scratch();
    prev.set(out);
    for (let i = 0; i < out.length; i++) {
      if (!ctx.transparent(i)) {
        out[i] = 0; // opaque cells hold no scent
        continue;
      }
      let sum = 0;
      let count = 0;
      for (const nb of neighborsOf(i, ctx)) {
        if (ctx.transparent(nb)) {
          sum += prev[nb]!;
          count++;
        }
      }
      const avg = count > 0 ? sum / count : 0;
      out[i] = prev[i]! * (1 - diffusion) + diffusion * avg;
    }
  },
};
