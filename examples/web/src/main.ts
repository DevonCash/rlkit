/**
 * rlkit web demo — the DOM wiring that lives OUTSIDE the headless engine.
 *
 * This is the only place that touches the browser: it mounts a <canvas>, builds
 * a world from the rlkit library, and wires the real `window` keyboard +
 * canvas 2D context into the engine's structurally-typed adapters. The engine
 * itself stays DOM-free.
 */
import {
  createWorld,
  defaultConfig,
  buildLevel,
  spawn,
  computeVisibility,
  CanvasRenderer,
  KeyboardInput,
  createSession,
  type Config,
  type Stance,
} from 'rlkit';

const config: Config = {
  ...defaultConfig,
  factions: {
    default: 'neutral' as Stance,
    matrix: { monster: { player: 'hostile' }, player: { monster: 'hostile' } },
  },
};

const world = createWorld({ config, rng: Date.now() & 0xffff });

// --- content: a player and some goblins ------------------------------------
const blueprints = world.services.registries.blueprints;
blueprints.register('player', {
  id: 'player',
  components: [
    { type: 'renderable', glyph: '@', fg: '#fff', layer: 5 },
    { type: 'allegiance', faction: 'player' },
    { type: 'stats', base: { 'max-hp': 30, attack: 6, defense: 1, 'sight-radius': 8 } },
    { type: 'resources', pools: { hp: { current: 30 } } },
    { type: 'inventory', items: [] },
  ],
});
blueprints.register('goblin', {
  id: 'goblin',
  components: [
    { type: 'renderable', glyph: 'g', fg: '#6c6', layer: 5 },
    { type: 'allegiance', faction: 'monster' },
    { type: 'stats', base: { 'max-hp': 8, attack: 3 } },
    { type: 'resources', pools: { hp: { current: 8 } } },
  ],
  mixins: ['aiHunter', 'aiWanderer'],
});

const { level, entrance } = buildLevel(world, { generator: 'bsp', width: 60, height: 30 });
const player = spawn(world, 'player', { at: entrance, levelId: level.id });
world.services.timeline.addActor(player.id, 100);

const rng = world.services.rng;
for (let i = 0; i < 8; i++) {
  const cell = rng.int(0, level.width * level.height - 1);
  // place only on a floor cell that isn't the entrance
  if (cell !== entrance && level.layers.get('tiles')) {
    const tiles = level.layers.get('tiles') as Uint16Array;
    if (tiles[cell] === world.services.tiles.index('floor')) {
      const g = spawn(world, 'goblin', { at: cell, levelId: level.id });
      world.services.timeline.addActor(g.id, 100);
    }
  }
}

computeVisibility(world, player.id);

// --- DOM wiring: canvas + keyboard → the engine adapters --------------------
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const tileSize = 16;
const renderer = new CanvasRenderer(ctx, { tileSize, font: `${tileSize}px monospace` });

const viewport = { width: Math.floor(canvas.width / tileSize), height: Math.floor(canvas.height / tileSize) };
const session = createSession({ world, player: player.id, renderer, viewport });

const input = new KeyboardInput(window, config.keymap);
input.onCommand((cmd) => session.onCommand(cmd));

session.render();
