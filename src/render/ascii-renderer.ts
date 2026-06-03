/**
 * ascii-renderer — a headless `Renderer` that produces a text grid.
 *
 * No DOM — ideal for tests, the determinism golden-run (§22.13), and printing a
 * running game to a terminal. Deterministic: one glyph per cell, row-major.
 */
import type { Renderer } from './renderer';
import type { RenderFrame } from './frame';

export class AsciiRenderer implements Renderer {
  private lines: string[] = [];

  draw(frame: RenderFrame): void {
    const rows: string[] = [];
    for (let y = 0; y < frame.height; y++) {
      let row = '';
      for (let x = 0; x < frame.width; x++) {
        const glyph = frame.cells[y * frame.width + x]?.glyph ?? ' ';
        row += glyph.length > 0 ? glyph : ' ';
      }
      rows.push(row);
    }
    this.lines = rows;
  }

  resize(): void {
    // ASCII output is sized by each frame; nothing to do.
  }

  /** The rendered rows of the last frame. */
  get rows(): readonly string[] {
    return this.lines;
  }

  toString(): string {
    return this.lines.join('\n');
  }
}
