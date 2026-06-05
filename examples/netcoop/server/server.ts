/**
 * server — the authoritative WebSocket host. Holds one `GameServer` (hidden
 * fog), advances a fixed-timestep real-time loop, and broadcasts to each socket
 * only that player's `viewFor` frame. The hidden-info boundary is the server:
 * a client never receives an entity its player can't see.
 *
 * Transport-only — all the game logic is the engine's. A Cloudflare Durable
 * Object would wrap the same `GameServer`/`viewFor` calls.
 */
import { WebSocketServer, WebSocket } from 'ws';
import { createGameServer, type EntityId } from '../../../src/index';
import { buildCoopWorld, VIEWPORT } from './world';

export interface CoopServer {
  port: number;
  close: () => void;
}

/** Clamp an untrusted `dir` to a single step in [-1,1]² (or null if invalid). */
function unitDir(d: unknown): { x: number; y: number } | null {
  if (!d || typeof d !== 'object') return null;
  const { x, y } = d as { x?: unknown; y?: unknown };
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  const cx = Math.sign(x as number);
  const cy = Math.sign(y as number);
  return cx === 0 && cy === 0 ? null : { x: cx, y: cy };
}

/** Default origin policy: non-browser clients (no Origin) and localhost only. */
function localhostOnly(origin: string | undefined): boolean {
  if (!origin) return true; // node clients (bots/tests) send no Origin
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export function startCoopServer(opts: {
  port: number;
  fog?: 'shared' | 'hidden';
  seed?: number;
  allowedOrigin?: (origin: string | undefined) => boolean;
}): CoopServer {
  const { world, spawnPlayer } = buildCoopWorld(opts.seed ?? 12345);
  const game = createGameServer({ world, spawnPlayer, fog: opts.fog ?? 'hidden' });
  const sockets = new Map<WebSocket, EntityId>();
  const lastSent = new Map<WebSocket, string>();
  const originOk = opts.allowedOrigin ?? localhostOnly;
  const wss = new WebSocketServer({
    port: opts.port,
    verifyClient: (info: { origin?: string }) => originOk(info.origin),
  });

  wss.on('connection', (ws) => {
    const id = game.join();
    sockets.set(ws, id);
    ws.send(JSON.stringify({ type: 'welcome', playerId: id, viewport: VIEWPORT }));

    ws.on('message', (data) => {
      let msg: { type?: string; dir?: { x: number; y: number } };
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg.type === 'input') {
        const dir = unitDir(msg.dir); // sanitize: a single, valid step — no speed-hack / NaN
        if (dir) game.enqueue(id, { type: 'move', actor: id, dir });
      }
    });

    ws.on('close', () => {
      sockets.delete(ws);
      lastSent.delete(ws);
      game.leave(id);
    });
  });

  // Fixed-timestep sim; broadcast each player its own frame ~25×/sec.
  const MS_PER_TICK = 16;
  let last = Date.now();
  let acc = 0;
  const loop = setInterval(() => {
    const now = Date.now();
    acc += now - last;
    last = now;
    const ticks = Math.min(8, Math.floor(acc / MS_PER_TICK));
    if (ticks > 0) {
      acc -= ticks * MS_PER_TICK;
      game.tick(ticks);
    }
    for (const [ws, id] of sockets) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const payload = JSON.stringify({ type: 'view', ...game.viewFor(id, VIEWPORT) });
      if (payload === lastSent.get(ws)) continue; // skip an unchanged frame
      lastSent.set(ws, payload);
      ws.send(payload);
    }
  }, 40);

  return {
    port: opts.port,
    close: () => {
      clearInterval(loop);
      for (const ws of sockets.keys()) ws.close();
      wss.close();
    },
  };
}
