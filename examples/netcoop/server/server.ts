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
import { createGameServer, type Action, type EntityId } from '../../../src/index';
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

/**
 * Reusable input seam: each client message `type` maps to a decoder that
 * sanitizes its own payload and returns a typed `Action` (or null to drop it).
 * The engine's `enqueue` takes any `Action`, so a game adds variants (e.g.
 * `useOn`) by adding a branch here — the move-only special-case generalized.
 */
type Decoder = (msg: Record<string, unknown>, actor: EntityId) => Action | null;

const DECODERS: Record<string, Decoder> = {
  // Movement: a single validated step (no speed-hack / NaN).
  input: (msg, actor) => {
    const dir = unitDir(msg.dir);
    return dir ? { type: 'move', actor, dir } : null;
  },
  // Tool-on-target: a sanitized cell target (the game registers the `useOn` handler).
  useOn: (msg, actor) =>
    Number.isInteger(msg.cell)
      ? { type: 'useOn', actor, target: { kind: 'cell', cell: msg.cell as number } }
      : null,
};

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
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(data)) as Record<string, unknown>;
      } catch {
        return;
      }
      const decode = typeof msg.type === 'string' ? DECODERS[msg.type] : undefined;
      const action = decode?.(msg, id);
      if (action) game.enqueue(id, action);
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
