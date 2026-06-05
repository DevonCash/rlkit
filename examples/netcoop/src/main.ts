/**
 * netcoop client — a THIN client: it runs no simulation. It connects to the
 * authoritative server, draws whatever per-player frame the server sends (which
 * already excludes everything this player can't see), and forwards key presses
 * as input intents. The hidden-info guarantee lives entirely on the server.
 */
import { CanvasRenderer, type RenderFrame } from 'rlkit';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const TILE = 16;
const renderer = new CanvasRenderer(ctx, { tileSize: TILE, font: `${TILE}px monospace` });
const statusEl = document.getElementById('status')!;

const WS_URL = `ws://${location.hostname}:8787`;
let socket: WebSocket | undefined;

function connect(): void {
  const ws = new WebSocket(WS_URL);
  socket = ws;
  ws.onopen = () => (statusEl.textContent = 'connected — you are a player');
  ws.onclose = () => {
    statusEl.textContent = 'disconnected — retrying…';
    setTimeout(connect, 1000);
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data as string) as {
      type: string;
      viewport?: { width: number; height: number };
      frame?: RenderFrame;
      hp?: { current: number; max: number };
      alive?: boolean;
    };
    if (msg.type === 'welcome' && msg.viewport) {
      canvas.width = msg.viewport.width * TILE;
      canvas.height = msg.viewport.height * TILE;
    } else if (msg.type === 'view' && msg.frame) {
      renderer.draw(msg.frame);
      const hp = msg.hp ? `HP ${msg.hp.current}/${msg.hp.max}` : '';
      statusEl.textContent = msg.alive ? `you · ${hp}` : 'YOU DIED';
    }
  };
}
connect();

const KEYS: Record<string, { x: number; y: number }> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
};
window.addEventListener('keydown', (ev) => {
  const dir = KEYS[ev.key];
  if (dir && socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'input', dir }));
    ev.preventDefault();
  }
});
