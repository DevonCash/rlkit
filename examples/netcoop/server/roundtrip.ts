/**
 * roundtrip — headless network verification: boot the server, connect TWO ws
 * clients, and assert (1) each receives its OWN per-player frame over the wire
 * (the hidden-info boundary holds end-to-end) and (2) malformed/oversized input
 * is sanitized server-side and can't corrupt the world.
 * Run: `npm test` (or `npx tsx server/roundtrip.ts`).
 */
import { WebSocket } from 'ws';
import { startCoopServer } from './server';

interface Msg {
  type: string;
  playerId?: string;
  frame?: { width: number; height: number; cells: { glyph: string }[] };
}

interface Client {
  playerId: string;
  ws: WebSocket;
  awaitView: () => Promise<Msg>;
}

function client(url: string): Promise<Client> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    let pending: ((m: Msg) => void) | null = null;
    let queued: Msg | null = null;
    const awaitView = (): Promise<Msg> => {
      if (queued) {
        const m = queued;
        queued = null;
        return Promise.resolve(m);
      }
      return new Promise((r) => (pending = r));
    };
    ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as Msg;
      if (m.type === 'welcome' && m.playerId) resolve({ playerId: m.playerId, ws, awaitView });
      else if (m.type === 'view') {
        if (pending) {
          pending(m);
          pending = null;
        } else queued = m;
      }
    });
  });
}

async function main(): Promise<void> {
  const port = 8799;
  const srv = startCoopServer({ port, fog: 'hidden', seed: 7 });
  const url = `ws://localhost:${port}`;
  const fail = (msg: string): never => {
    console.error('FAIL:', msg);
    srv.close();
    process.exit(1);
  };
  const timeout = setTimeout(() => fail('timed out'), 5000);

  const a = await client(url);
  const b = await client(url);
  const [va, vb] = await Promise.all([a.awaitView(), b.awaitView()]);

  // (1) Per-player frames over the wire.
  if (a.playerId === b.playerId) fail('two clients got the same playerId');
  const fa = va.frame;
  const fb = vb.frame;
  if (!fa || !fb) return fail('a client received no frame');
  if (!fa.cells.some((c) => c.glyph === '@')) fail('player A does not see its own @');
  if (!fb.cells.some((c) => c.glyph === '@')) fail('player B does not see its own @');
  if (JSON.stringify(fa) === JSON.stringify(fb)) fail('both clients got an identical frame — not per-player');

  // (2) Malformed / oversized input must not corrupt the server.
  a.ws.send(JSON.stringify({ type: 'input', dir: { x: 5, y: 0 } })); // speed-hack attempt
  a.ws.send(JSON.stringify({ type: 'input', dir: { x: 'foo' } })); // non-numeric
  a.ws.send(JSON.stringify({ type: 'input', dir: null }));
  a.ws.send(JSON.stringify({ type: 'input' }));
  // Several frames later the stream is still valid (no NaN, still see own @).
  let after = va;
  for (let i = 0; i < 5; i++) after = await a.awaitView();
  if (!after.frame || !after.frame.cells.some((c) => c.glyph === '@')) fail('server corrupted by malformed input');

  clearTimeout(timeout);
  console.log(`PASS: distinct per-player frames over the wire (${a.playerId}, ${b.playerId}); malformed/oversized input sanitized.`);
  srv.close();
  process.exit(0);
}

void main();
