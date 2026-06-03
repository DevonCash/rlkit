/**
 * canvas-renderer — a canvas `Renderer` (§13.2).
 *
 * Draws glyphs to a 2D canvas context. To keep the project's headless guarantee
 * (no DOM in `tsconfig.lib`), the context is typed by a local **structural**
 * `Ctx2D` interface covering only the members used — a real
 * `canvas.getContext('2d')` is structurally assignable to it. tile size, font,
 * and colors are config.
 */
import type { Renderer } from './renderer';
import type { RenderFrame } from './frame';

/** The subset of `CanvasRenderingContext2D` this renderer uses (no DOM lib). */
export interface Ctx2D {
  fillStyle: string;
  font: string;
  textBaseline: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  readonly canvas: { width: number; height: number };
}

export interface CanvasRendererOptions {
  tileSize?: number;
  font?: string;
}

export class CanvasRenderer implements Renderer {
  private readonly tile: number;
  private readonly font: string;

  constructor(
    private readonly ctx: Ctx2D,
    options: CanvasRendererOptions = {},
  ) {
    this.tile = options.tileSize ?? 16;
    this.font = options.font ?? `${this.tile}px monospace`;
  }

  draw(frame: RenderFrame): void {
    const t = this.tile;
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.font = this.font;
    this.ctx.textBaseline = 'top';
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const c = frame.cells[y * frame.width + x];
        if (!c) continue;
        this.ctx.fillStyle = c.bg;
        this.ctx.fillRect(x * t, y * t, t, t);
        if (c.glyph && c.glyph !== ' ') {
          this.ctx.fillStyle = c.fg;
          this.ctx.fillText(c.glyph, x * t, y * t);
        }
      }
    }
  }

  resize(width: number, height: number): void {
    this.ctx.canvas.width = width * this.tile;
    this.ctx.canvas.height = height * this.tile;
  }
}
