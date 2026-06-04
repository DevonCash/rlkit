/**
 * targeting-modal — a cursor over cells with AoE preview (§15, §11A.3).
 *
 * Holds a cursor (viewport coordinates) moved by movement commands; renders the
 * cursor + an optional shape preview (`cellsIn`) as `Overlay[]` over the world
 * frame. `confirm` delivers the cursor cell via `onConfirm`; `cancel` closes.
 */
import type { Modal, ModalResult } from '../stack';
import type { Viewport } from '../../render/camera';
import type { Overlay } from '../../render/frame';
import type { Point } from '../../core/coords';
import type { Shape } from '../../core/geometry';
import { cellsIn } from '../../core/geometry';
import { moveDirection } from '../../input/command-to-action';

export interface TargetingColors {
  path: string;
  cursor: string;
}

const DEFAULT_TARGETING_COLORS: TargetingColors = { path: '#330', cursor: '#ff0' };

export interface TargetingModalOptions {
  /** Initial cursor in viewport coordinates. */
  cursor: Point;
  shape?: Shape;
  onConfirm(cursor: Point): void;
  onCancel?(): void;
  colors?: TargetingColors;
  /** Viewport bounds for cursor clamping (defaults applied on first render). */
  viewport?: Viewport;
}

export interface TargetingModal extends Modal {
  cursor(): Point;
}

export function createTargetingModal(opts: TargetingModalOptions): TargetingModal {
  const cur: Point = { ...opts.cursor };
  const c = opts.colors ?? DEFAULT_TARGETING_COLORS;
  let bounds: Viewport | undefined = opts.viewport;

  return {
    cursor: () => ({ ...cur }),
    render(viewport: Viewport): Overlay[] {
      bounds = viewport; // remember bounds so `handle` can clamp the cursor
      const overlays: Overlay[] = [];
      if (opts.shape) {
        for (const p of cellsIn(cur, opts.shape, { width: viewport.width, height: viewport.height })) {
          overlays.push({ cell: p.y * viewport.width + p.x, bg: c.path });
        }
      }
      overlays.push({ cell: cur.y * viewport.width + cur.x, glyph: '*', fg: c.cursor });
      return overlays;
    },
    handle(cmd): ModalResult {
      const dir = moveDirection(cmd.type);
      if (dir) {
        // Clamp to the viewport on both bounds (upper bound once known).
        const maxX = bounds ? bounds.width - 1 : Infinity;
        const maxY = bounds ? bounds.height - 1 : Infinity;
        cur.x = Math.min(maxX, Math.max(0, cur.x + dir.x));
        cur.y = Math.min(maxY, Math.max(0, cur.y + dir.y));
        return 'consumed';
      }
      if (cmd.type === 'confirm') {
        opts.onConfirm({ ...cur });
        return 'close';
      }
      if (cmd.type === 'cancel') {
        opts.onCancel?.();
        return 'close';
      }
      return 'consumed';
    },
  };
}
