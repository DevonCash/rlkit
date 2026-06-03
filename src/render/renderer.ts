/**
 * renderer — the renderer interface (§13.2).
 *
 * Consumes `RenderFrame`s; owns nothing about rules. No DOM in the signature —
 * concrete renderers (ASCII, canvas) implement it.
 */
import type { RenderFrame } from './frame';

export interface Renderer {
  draw(frame: RenderFrame): void;
  resize(width: number, height: number): void;
}
