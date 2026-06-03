/**
 * stack — the modal stack (§15).
 *
 * Menus (inventory, targeting, …) are pushed/popped; the top modal captures
 * input. A `Modal` renders to a full-screen `RenderFrame` (a list menu) or an
 * `Overlay[]` over the world frame (a targeting cursor), and reports whether it
 * consumed the command, passed it through, or wants to close.
 */
import type { RenderFrame, Overlay } from '../render/frame';
import type { Viewport } from '../render/camera';
import type { Command } from '../input/command';

export type ModalResult = 'consumed' | 'pass' | 'close';

export interface Modal {
  render(viewport: Viewport): RenderFrame | Overlay[];
  handle(cmd: Command): ModalResult;
}

export interface UIStack {
  push(modal: Modal): void;
  pop(): Modal | undefined;
  top(): Modal | undefined;
  readonly size: number;
}

export function createUIStack(): UIStack {
  const stack: Modal[] = [];
  return {
    push: (m) => void stack.push(m),
    pop: () => stack.pop(),
    top: () => stack[stack.length - 1],
    get size() {
      return stack.length;
    },
  };
}
