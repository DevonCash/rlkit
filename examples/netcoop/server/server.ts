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

export function startCoopServer(opts: { port: number; fog?: 'shared' | 'hidden'; seed?: number }): CoopServer {
  const { world, spawnPlayer } = buildCoopWorld(opts.seed ?? 12345);
  const game = createGameServer({ world, spawnPlayer, fog: opts.fog ?? 'hidden' });
  const sockets = new Map<WebSocket, EntityId>();
  const wss = new WebSocketServer({ port: opts.port });

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
      if (msg.type === 'input' && msg.dir) game.enqueue(id, { type: 'move', actor: id, dir: msg.dir });
    });

    ws.on('close', () => {
      sockets.delete(ws);
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
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'view', ...game.viewFor(id, VIEWPORT) }));
      }
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
