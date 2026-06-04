/**
 * main — the DOM wiring for Depths (the only browser-touching file).
 *
 * Mounts the canvas, injects a real `localStorage` save port and `window`
 * keyboard into the headless game controller, and forwards commands. The engine
 * and the game logic stay DOM-free.
 */
import { CanvasRenderer, KeyboardInput } from 'rlkit';
import { createGame, gameConfig, SAVE_KEY, type Storage } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const tileSize = 16;
const renderer = new CanvasRenderer(ctx, { tileSize, font: `${tileSize}px monospace` });
const viewport = { width: Math.floor(canvas.width / tileSize), height: Math.floor(canvas.height / tileSize) };

const storage: Storage = {
  get: () => localStorage.getItem(SAVE_KEY),
  set: (v) => localStorage.setItem(SAVE_KEY, v),
  clear: () => localStorage.removeItem(SAVE_KEY),
};

const game = createGame({ renderer, viewport, storage, seed: Date.now() & 0xffff });

const input = new KeyboardInput(window, gameConfig.keymap);
input.onCommand((cmd) => game.onCommand(cmd));

// Real-time clock: a fixed logical timestep keeps the sim deterministic
// regardless of frame rate; movement is buffered, so releasing a key stops it.
const MS_PER_TICK = 16; // ~6 player moves/sec at default speed
const MAX_TICKS = 8; // clamp a long frame (tab unfocus) so it can't spiral
let last = performance.now();
let acc = 0;
function frame(now: number): void {
  const dt = now - last;
  last = now;
  if (game.realtimeActive()) {
    acc += dt;
    const ticks = Math.min(MAX_TICKS, Math.floor(acc / MS_PER_TICK));
    if (ticks > 0) {
      acc -= ticks * MS_PER_TICK;
      game.tick(ticks);
    }
  } else {
    acc = 0; // don't bank time while paused (modal open / game over / turn-based)
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Releasing a movement/wait key stops continuous movement (clears the buffer).
window.addEventListener('keyup', (e) => {
  const cmd = gameConfig.keymap[e.key];
  if (cmd && (cmd.startsWith('move-') || cmd === 'wait')) game.clearBuffer();
});

game.start();
