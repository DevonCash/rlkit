/**
 * pointer — the pointer input adapter (§14).
 *
 * Pointer input (click-to-path, hover-to-inspect) maps to the same command set.
 * Structurally typed like `KeyboardInput`; the caller supplies a pixel→cell
 * converter (the renderer knows the tile size). Emits `pointer-select` /
 * `pointer-hover` commands carrying the target cell coordinates.
 */
import type { Command, InputSource } from './command';

export interface PointerLikeEvent {
  offsetX: number;
  offsetY: number;
  preventDefault?(): void;
}

export interface PointerTargetLike {
  addEventListener(type: string, listener: (ev: PointerLikeEvent) => void): void;
}

export interface PointerInputOptions {
  /** Convert a pointer pixel position to a viewport cell `{x,y}`. */
  toCell(px: number, py: number): { x: number; y: number };
}

export class PointerInput implements InputSource {
  private listeners: Array<(cmd: Command) => void> = [];

  constructor(target: PointerTargetLike, opts: PointerInputOptions) {
    const emit = (type: string) => (ev: PointerLikeEvent) => {
      const { x, y } = opts.toCell(ev.offsetX, ev.offsetY);
      for (const fn of this.listeners) fn({ type, x, y });
    };
    target.addEventListener('pointerdown', emit('pointer-select'));
    target.addEventListener('pointermove', emit('pointer-hover'));
  }

  onCommand(fn: (cmd: Command) => void): void {
    this.listeners.push(fn);
  }
}
