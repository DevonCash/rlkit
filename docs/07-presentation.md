# Presentation — Events, Rendering, Input & UI

> Part of the **rlkit** engine spec — sections §12–15. The event/message log, the headless render frame + canvas adapter, input mapping, and the UI/modal stack.
>
> See also: 01-core-model · 08-persistence. Full map and reading order: [INDEX.md](./INDEX.md).

---

## 12. Events, message bus, and the log

A typed event bus is the backbone for decoupling.

```ts
interface EventBus {
  on(type: string, fn: (ev: GameEvent) => void): () => void;  // returns unsubscribe
  emit(ev: GameEvent): void;   // enqueues into the reaction loop (§7.3), not a recursive call
}
```

`GameEvent` is the typed discriminated union from §7.2, so subscribers and `ts-pattern` sites get real payload types. Emission is mediated by the reaction loop (§7.3): events drain FIFO to a fixed point with a depth guard, never recursively.

The **message log** is a bus subscriber that turns events into player-facing text via a templating table (config: event type → message template). The presentation layer and AI also subscribe. The core emits; it does not format strings.

---

## 13. Rendering: headless render state + canvas adapter

### 13.1 Render model (in core)

The core can produce a `RenderFrame` — a pure description of what should be on screen — without knowing about canvas.

```ts
interface Cell { glyph: string; fg: string; bg: string; }
interface RenderFrame {
  width: number; height: number;
  cells: Cell[];               // row-major, post-FOV (dimmed/hidden applied)
  overlays: Overlay[];         // cursors, targeting lines, effects
}
function buildFrame(world: World, viewport: Viewport, camera: Camera, opts?: BuildFrameOptions): RenderFrame;
interface BuildFrameOptions { visibleLayer?: string; exploredLayer?: string; } // default: the shared 'visible'/'explored'
```

FOV/visibility, layering (floor < items < actors), and "explored but not visible" dimming are resolved here as logic; the specific colors/dim factors are config. The optional `visibleLayer`/`exploredLayer` select *which* visibility a frame is built against — passing `visibleLayerFor(playerId)`/`exploredLayerFor(playerId)` renders a single player's view, so an entity the viewer can't see is simply **absent** from the frame's cells. That makes the serialized `RenderFrame` the anti-cheat unit for hidden-info multiplayer (§25): a server can ship each client only its own `buildFrame` output and leak nothing.

### 13.2 Canvas adapter

The canvas renderer consumes `RenderFrame`s and draws glyphs (monospace font) or sprite tiles from a tilesheet. It owns nothing about rules.

```ts
interface Renderer {
  draw(frame: RenderFrame): void;
  resize(w: number, h: number): void;
}
class CanvasRenderer implements Renderer { /* tile size, font, tilesheet are config */ }
```

Camera/viewport (follow player, scrolling, centering) live as a small presentation utility. Animation is driven by consuming events between frames (e.g. a `damaged` event → brief flash) and is optional — the core never blocks on it.

Performance levers, both behind the same `Renderer` interface and both deferred until canvas2d measurably stalls: render on a Web Worker via **OffscreenCanvas** (moves drawing, and optionally the sim loop, off the main thread), or a **PixiJS** WebGL renderer for batched glyph/sprite drawing if content gets heavy on tilesets or particles. Neither touches game logic.

---

## 14. Input mapping

Input is an adapter that converts raw events into engine **commands**, which the driver translates into the player's `Action`.

```ts
interface Command { type: string; [k: string]: unknown; }
interface InputSource { onCommand(fn: (c: Command) => void): void; }

interface Keymap { [keyCombo: string]: string; }  // 'ArrowUp' -> 'move-north'  (fully configurable)
```

A default keymap is provided as config (vi-keys + arrows + numpad). Pointer input (click-to-path, hover-to-inspect) maps to the same command set. Context matters: when a modal is open, input routes to the UI stack instead of the world (see §15).

---

## 15. UI layer: HUD, log, menu/modal stack

A lightweight, renderer-agnostic UI built on the same `RenderFrame`/event ideas, so it works on canvas and stays testable.

- **HUD**: subscribes to state, draws hp/stats/depth/etc. Layout is config.
- **Message log**: scrollable view of the log buffer.
- **Modal stack**: menus (inventory, equipment, targeting, level-up, main menu) are pushed/popped. The top modal captures input. Modals are data-driven where possible (a list modal takes items + a select callback) so games don't reimplement menu plumbing.

```ts
interface Modal {
  render(viewport: Viewport): RenderFrame | Overlay[];
  handle(cmd: Command): 'consumed' | 'pass' | 'close';
}
interface UIStack { push(m: Modal): void; pop(): void; top(): Modal | undefined; }
```

The UI is optional and additive — a game can ignore it and render its own.

---
