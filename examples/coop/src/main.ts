/**
 * coop — a real-time co-op demo: one authoritative `GameServer`, two players
 * sharing one dungeon, drawn as a split view. In-process (no network) — the same
 * `join`/`enqueue`/`tick` interface a WebSocket/Durable-Object transport would
 * drive. The world keeps ticking on a fixed timestep; fog is the shared union of
 * both players; one death doesn't end the other's run.
 */
import {
  createWorld,
  defaultConfig,
  buildLevel,
  createEntity,
  get,
  deriveStat,
  cellOf,
  pointOf,
  reachableFrom,
  computeVisibilityUnion,
  createGameServer,
  buildFrame,
  CanvasRenderer,
  type Config,
  type World,
  type Stance,
  type EntityId,
  type RenderFrame,
  type FrameCell,
  type Resources,
} from 'rlkit';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const TILE = 16;
const COLS = Math.floor(canvas.width / TILE);
const ROWS = Math.floor(canvas.height / TILE);
const renderer = new CanvasRenderer(ctx, { tileSize: TILE, font: `${TILE}px monospace` });

const config: Config = {
  ...defaultConfig,
  factions: { default: 'neutral' as Stance, matrix: { monster: { player: 'hostile' }, player: { monster: 'hostile' } } },
};

// --- one shared, authoritative world ---------------------------------------
const world = createWorld({ config, rng: Date.now() & 0xffff });
const built = buildLevel(world, { generator: 'bsp', width: 64, height: 40, depth: 1, id: 'L' });
const level = built.level;
const palette = world.services.tiles;
const tiles = level.layers.get('tiles') as Uint16Array;
const reachable = [...reachableFrom(tiles, level.width, level.height, built.entrance, (i) => palette.byIndex(i).walkable)];
const rng = world.services.rng;

let nextMon = 0;
function freeCell(): number {
  for (let t = 0; t < 50; t++) {
    const c = reachable[rng.int(0, reachable.length - 1)]!;
    if ([...world.services.queries.at(c, level.id)].length === 0) return c;
  }
  return built.entrance;
}
function spawnMonster(): void {
  const id = `mon-${nextMon++}`;
  const cell = freeCell();
  const { x, y } = pointOf(cell, level.width);
  const e = createEntity(
    id,
    [
      { type: 'position', x, y, levelId: level.id },
      { type: 'renderable', glyph: 'g', fg: '#6c6', layer: 5 },
      { type: 'info', name: 'Goblin' },
      { type: 'allegiance', faction: 'monster' },
      { type: 'stats', base: { 'max-hp': 8, attack: 2 } },
      { type: 'resources', pools: { hp: { current: 8 } } },
    ],
    ['aiHunter', 'aiWanderer'],
  );
  world.state.entities.set(id, e);
  world.services.queries.index(e);
  world.services.queries.place(id, level.id, cell);
  world.services.timeline.addActor(id, 10);
}

const PLAYER_COLORS = ['#6cf', '#fc6'];
let joined = 0;
function spawnPlayer(w: World): EntityId {
  const n = joined++;
  const id = `player-${n}`;
  const cell = reachable[n] ?? built.entrance; // distinct walkable cells near the entrance
  const { x, y } = pointOf(cell, level.width);
  const e = createEntity(id, [
    { type: 'position', x, y, levelId: level.id },
    { type: 'renderable', glyph: '@', fg: PLAYER_COLORS[n] ?? '#fff', layer: 10 },
    { type: 'info', name: `Player ${n + 1}` },
    { type: 'allegiance', faction: 'player' },
    { type: 'stats', base: { 'max-hp': 30, attack: 5, defense: 1, speed: 10, 'sight-radius': 8 } },
    { type: 'resources', pools: { hp: { current: 30 } } },
  ]);
  w.state.entities.set(id, e);
  w.services.queries.index(e);
  w.services.queries.place(id, level.id, cell);
  w.services.timeline.addActor(id, 10);
  return id;
}

const server = createGameServer({ world, spawnPlayer });
const p1 = server.join();
const p2 = server.join();
for (let i = 0; i < 8; i++) spawnMonster(); // after players, so they don't overlap
computeVisibilityUnion(world, [p1, p2]);

// --- input: each player's keys buffer a move on the server -----------------
const MOVES: Record<string, { x: number; y: number }> = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
  E: { x: 1, y: 0 },
};
const P1: Record<string, keyof typeof MOVES> = { ArrowUp: 'N', ArrowDown: 'S', ArrowLeft: 'W', ArrowRight: 'E' };
const P2: Record<string, keyof typeof MOVES> = { w: 'N', s: 'S', a: 'W', d: 'E' };
window.addEventListener('keydown', (ev) => {
  const m1 = P1[ev.key];
  if (m1) {
    server.enqueue(p1, { type: 'move', actor: p1, dir: MOVES[m1]! });
    ev.preventDefault();
    return;
  }
  const m2 = P2[ev.key];
  if (m2) {
    server.enqueue(p2, { type: 'move', actor: p2, dir: MOVES[m2]! });
    ev.preventDefault();
  }
});

// --- real-time loop (fixed timestep keeps the sim deterministic) ------------
const MS_PER_TICK = 16;
const MAX_TICKS = 8;
let last = performance.now();
let acc = 0;
let over = false;
function frame(now: number): void {
  const dt = now - last;
  last = now;
  if (!over) {
    acc += dt;
    const ticks = Math.min(MAX_TICKS, Math.floor(acc / MS_PER_TICK));
    if (ticks > 0) {
      acc -= ticks * MS_PER_TICK;
      if (server.tick(ticks).idle) over = true;
    }
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- split render: left = player 1, right = player 2 -----------------------
const HALF = (COLS - 1) >> 1;
const MAPH = ROWS - 1;
const blank = (): FrameCell => ({ glyph: ' ', fg: '#666', bg: '#000' });
function copyInto(dst: FrameCell[], colOff: number, src: RenderFrame): void {
  for (let y = 0; y < MAPH && y < src.height; y++)
    for (let x = 0; x < HALF && x < src.width; x++) dst[y * COLS + colOff + x] = src.cells[y * src.width + x]!;
}
function writeRow(dst: FrameCell[], x0: number, y: number, text: string, fg: string): void {
  for (let i = 0; i < text.length && x0 + i < COLS; i++) {
    const c = dst[y * COLS + x0 + i];
    if (c) {
      c.glyph = text.charAt(i);
      c.fg = fg;
    }
  }
}
function hpText(id: EntityId): string {
  const e = world.state.entities.get(id);
  if (!e) return 'dead';
  const cur = get<Resources>(e, 'resources')?.pools.hp?.current ?? 0;
  return `HP ${cur}/${deriveStat(e, world, 'max-hp')}`;
}
function render(): void {
  const cells: FrameCell[] = new Array(COLS * ROWS);
  for (let i = 0; i < cells.length; i++) cells[i] = blank();
  const vp = { width: HALF, height: MAPH };
  copyInto(cells, 0, buildFrame(world, vp, { centerOn: p1 }));
  copyInto(cells, HALF + 1, buildFrame(world, vp, { centerOn: p2 }));
  for (let y = 0; y < MAPH; y++) {
    const c = cells[y * COLS + HALF];
    if (c) {
      c.glyph = '|';
      c.fg = '#333';
    }
  }
  writeRow(cells, 0, MAPH, `Player 1   ${hpText(p1)}`, '#6cf');
  writeRow(cells, HALF + 1, MAPH, `Player 2   ${hpText(p2)}`, '#fc6');
  if (over) writeRow(cells, (COLS >> 1) - 5, MAPH >> 1, ' GAME OVER ', '#f55');
  renderer.draw({ width: COLS, height: ROWS, cells, overlays: [] });
}
render();
