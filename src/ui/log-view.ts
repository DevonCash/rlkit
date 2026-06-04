/**
 * log-view — a scrollable view over the message log (§15).
 *
 * Renders the last `height` messages as `Overlay[]` at the top of the viewport.
 * The buffer itself is the M7 `MessageLog`; this is just the view.
 */
import type { MessageLog } from './log';
import type { Viewport } from '../render/camera';
import type { Overlay } from '../render/frame';
import { textOverlays } from './composite';

export interface LogView {
  render(log: MessageLog, viewport: Viewport): Overlay[];
}

export function createLogView(height = 5, fg = '#9cf'): LogView {
  return {
    render(log, viewport): Overlay[] {
      const lines = log.messages().slice(-height);
      const out: Overlay[] = [];
      lines.forEach((line, i) => {
        out.push(...textOverlays(line.slice(0, viewport.width), 0, i, viewport, fg));
      });
      return out;
    },
  };
}
