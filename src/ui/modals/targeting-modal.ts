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

export interface TargetingModalOptions {
  /** Initial cursor in viewport coordinates. */
  cursor: Point;
  shape?: Shape;
  onConfirm(cursor: Point): void;
  onCancel?(): void;
}

export interface TargetingModal extends Modal {
  cursor(): Point;
}

export function createTargetingModal(opts: TargetingModalOptions): TargetingModal {
  const cur: Point = { ...opts.cursor };

  return {
    cursor: () => ({ ...cur }),
    render(viewport: Viewport): Overlay[] {
      const overlays: Overlay[] = [];
      if (opts.shape) {
        for (const p of cellsIn(cur, opts.shape, { width: viewport.width, height: viewport.height })) {
          overlays.push({ cell: p.y * viewport.width + p.x, bg: '#330' });
        }
      }
      overlays.push({ cell: cur.y * viewport.width + cur.x, glyph: '*', fg: '#ff0' });
      return overlays;
    },
    handle(cmd): ModalResult {
      const dir = moveDirection(cmd.type);
      if (dir) {
        // Lower-bounded at 0; render clips the upper bound to the viewport.
        cur.x = Math.max(0, cur.x + dir.x);
        cur.y = Math.max(0, cur.y + dir.y);
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
