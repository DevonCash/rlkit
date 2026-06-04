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

game.start();
