/**
 * composite — merge overlays into a RenderFrame's cells (§13/§15).
 *
 * The M7 renderers draw `RenderFrame.cells`; they don't consume
 * `frame.overlays`. So the session composites HUD + modal `Overlay[]` (in
 * VIEWPORT cell coordinates) into a copy of the frame's cells before drawing.
 * This keeps the renderers untouched and the result a plain `RenderFrame`.
 */
import type { RenderFrame, FrameCell, Overlay } from '../render/frame';
import type { Viewport } from '../render/camera';

/** A blank cells array for a fresh full-screen frame. */
export function blankCells(viewport: Viewport, fill: FrameCell): FrameCell[] {
  const cells: FrameCell[] = [];
  for (let i = 0; i < viewport.width * viewport.height; i++) cells.push({ ...fill });
  return cells;
}

/** Write a string into a cells array at viewport `(x,y)` (clipped to bounds). */
export function writeText(
  cells: FrameCell[],
  viewport: Viewport,
  x: number,
  y: number,
  text: string,
  fg: string,
): void {
  if (y < 0 || y >= viewport.height) return;
  for (let i = 0; i < text.length; i++) {
    const cx = x + i;
    if (cx < 0 || cx >= viewport.width) continue;
    const cell = cells[y * viewport.width + cx];
    if (cell) {
      cell.glyph = text[i]!;
      cell.fg = fg;
    }
  }
}

/** Overlays as viewport text — convenience for HUD/log rows. */
export function textOverlays(text: string, x: number, y: number, viewport: Viewport, fg: string): Overlay[] {
  const out: Overlay[] = [];
  for (let i = 0; i < text.length; i++) {
    const cx = x + i;
    if (cx < 0 || cx >= viewport.width || y < 0 || y >= viewport.height) continue;
    out.push({ cell: y * viewport.width + cx, glyph: text[i]!, fg });
  }
  return out;
}

/** Apply viewport-cell overlays onto a copy of `frame`. */
export function composite(frame: RenderFrame, overlays: readonly Overlay[]): RenderFrame {
  const cells = frame.cells.map((c) => ({ ...c }));
  for (const o of overlays) {
    const cell = cells[o.cell];
    if (!cell) continue;
    if (o.glyph !== undefined) cell.glyph = o.glyph;
    if (o.fg !== undefined) cell.fg = o.fg;
    if (o.bg !== undefined) cell.bg = o.bg;
  }
  return { width: frame.width, height: frame.height, cells, overlays: [] };
}
