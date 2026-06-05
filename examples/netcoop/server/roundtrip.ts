/**
 * roundtrip — headless network verification: boot the server, connect TWO ws
 * clients, and assert each receives its OWN per-player frame over the wire (so
 * the hidden-info boundary holds end-to-end, not just in-process).
 * Run: `npx tsx server/roundtrip.ts`
 */
import { WebSocket } from 'ws';
import { startCoopServer } from './server';

interface Msg {
  type: string;
  playerId?: string;
  frame?: { width: number; height: number; cells: { glyph: string }[] };
}

function client(url: string): Promise<{ playerId: string; firstView: Promise<Msg> }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    let resolveView: (v: Msg) => void = () => {};
    const firstView = new Promise<Msg>((r) => (resolveView = r));
    ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as Msg;
      if (m.type === 'welcome' && m.playerId) resolve({ playerId: m.playerId, firstView });
      else if (m.type === 'view') resolveView(m);
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
  const timeout = setTimeout(() => fail('timed out waiting for views'), 5000);

  const a = await client(url);
  const b = await client(url);
  const [va, vb] = await Promise.all([a.firstView, b.firstView]);
  clearTimeout(timeout);

  if (a.playerId === b.playerId) fail('two clients got the same playerId');
  const fa = va.frame;
  const fb = vb.frame;
  if (!fa || !fb) return fail('a client received no frame');
  if (!fa.cells.some((c) => c.glyph === '@')) fail('player A does not see its own @');
  if (!fb.cells.some((c) => c.glyph === '@')) fail('player B does not see its own @');
  if (JSON.stringify(fa) === JSON.stringify(fb)) fail('both clients got an identical frame — not per-player');

  console.log(`PASS: distinct players (${a.playerId}, ${b.playerId}); each received its own per-player frame over the wire.`);
  srv.close();
  process.exit(0);
}

void main();
