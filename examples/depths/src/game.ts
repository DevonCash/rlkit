/**
 * game — the game controller: world lifecycle, custom commands, flow, and the
 * stacked presentation (map · status · log).
 *
 * Owns the world + session and swaps them on new-game / load. Headless: the
 * renderer and a small `Storage` port are injected, so the whole controller is
 * driven in node by the test suite and in the browser by `main.ts`. The game
 * owns rendering (the session is created without a renderer) so it can lay the
 * map, a status line, and the message log out as three stacked bands instead of
 * overlaying the log on the play area.
 */
import {
  createWorld,
  loadWorld,
  encodeSave,
  createSession,
  createMessageLog,
  createTargetingModal,
  buildFrame,
  viewportOrigin,
  describeCell,
  tickRealtime,
  commandToAction,
  isUIIntent,
  defaultConfig,
  createListModal,
  get,
  deriveStats,
  combatModule,
  progressionModule,
  identificationModule,
  rangedModule,
  hungerModule,
  doorsModule,
  displayName,
  type Module,
  type Config,
  type Action,
  type World,
  type Renderer,
  type Viewport,
  type Session,
  type CommandTable,
  type Stance,
  type Resources,
  type Position,
  type MessageLog,
  type FieldResolver,
  type Camera,
  type FrameCell,
  type TargetingModal,
  type Level,
} from 'rlkit';
import { depthsModule } from './content';
import { makeLevel, spawnPlayer } from './dungeon';
import { MAX_DEPTH, biomeForDepth } from './biomes';

export const SAVE_KEY = 'depths-save';
const FINAL_LEVEL = `depth-${MAX_DEPTH}`;
/** Rows reserved at the bottom of the canvas for the message log. */
const LOG_ROWS = 6;
/** Event payload fields that name an entity (resolved id → display name). */
const ENTITY_FIELDS = new Set(['entity', 'target', 'source', 'actor', 'item']);

/**
 * The opt-in modules Depths composes: combat depth, XP/levels, item identity &
 * curses, ranged/throw, hunger, doors — then the game's own content. The same
 * set is passed to `loadWorld`; the engine's manifest rejects a save written
 * with a different set, so this list *is* the game's save-compatibility key.
 */
const MODULES: Module[] = [
  combatModule({ critChance: 0.12, critMultiplier: 2 }),
  progressionModule({ curve: (lvl) => 20 + (lvl - 1) * 15, gains: () => ({ 'max-hp': 5, attack: 1 }) }),
  identificationModule(),
  rangedModule(),
  hungerModule({ drainPerTurn: 1, starveDamage: 1, maxSatiation: 100, foods: [{ effect: 'eat-ration', amount: 60 }] }),
  doorsModule(),
  depthsModule,
];

/** Display name of an entity (identity-aware), else a noun. */
function nameOf(world: World, id: string): string {
  if (!world.state.entities.has(id)) return 'something';
  return displayName(world, id);
}

/** A status line: depth · biome · level · HP · hunger. */
function statusText(world: World, player: string): string {
  const e = world.state.entities.get(player);
  if (!e) return '';
  const pos = get<Position>(e, 'position');
  const level = pos ? world.state.levels.get(pos.levelId) : undefined;
  const depth = Number(level?.metadata.depth ?? 0);
  const pools = get<Resources>(e, 'resources')?.pools;
  const stats = deriveStats(e, world);
  const hp = pools?.hp?.current ?? 0;
  const lvl = (e.components.get('experience') as { level?: number } | undefined)?.level ?? 1;
  const sat = pools?.satiation?.current ?? 0;
  const food = sat <= 0 ? 'Starving' : sat < 25 ? 'Hungry' : 'Fed';
  return `Depth ${depth} · ${biomeForDepth(depth).name}   Lv ${lvl}   HP ${hp}/${stats['max-hp'] ?? 0}   ${food}`;
}

/** Minimal persistence port (localStorage in the browser, a Map in tests). */
export interface Storage {
  get(): string | null;
  set(value: string): void;
  clear(): void;
}

/** The faction matrix, narration templates, and extended keymap the game runs with. */
export const gameConfig: Config = {
  ...defaultConfig,
  factions: {
    default: 'neutral' as Stance,
    matrix: { monster: { player: 'hostile' }, player: { monster: 'hostile' } },
  },
  // Curated, name-friendly narration. `moved`/`bumped` are intentionally dropped
  // (they spam every off-screen monster step); the resolver turns ids into names.
  log: {
    templates: {
      died: '{entity} is slain.',
      'item:picked': '{entity} picks up {item}.',
      'item:equipped': '{entity} wields {item}.',
      'item:unequipped': '{entity} removes {item}.',
      'item:used': '{entity} uses an item.',
      'item:identified': 'It is {item}!',
      'entity:changed-level': '{entity} takes the stairs.',
      'leveled-up': '{entity} reaches level {level}!',
      'curse:removed': 'A curse lifts from {entity}.',
    },
  },
  keymap: {
    ...defaultConfig.keymap,
    '>': 'descend',
    '<': 'ascend',
    S: 'save',
    L: 'load',
    e: 'open-equipment',
    x: 'look',
    t: 'throw',
  },
};

export interface GameDeps {
  renderer?: Renderer;
  viewport: Viewport;
  storage: Storage;
  /** Seed for a fresh game (the browser passes a time-derived seed). */
  seed: number;
}

export interface Game {
  onCommand(cmd: { type: string; [k: string]: unknown }): void;
  render(): void;
  hasSave(): boolean;
  /** Begin: show the title screen (Continue offered when a save exists). */
  start(): void;
  /** Whether the real-time clock should advance now (real-time mode, no modal, not over). */
  realtimeActive(): boolean;
  /** Advance the world by `ticks` world-ticks (real-time loop) and render. */
  tick(ticks: number): void;
  /** Clear the buffered movement (e.g. on key-up). */
  clearBuffer(): void;
  /** Test/inspection access. */
  readonly world: World;
  readonly player: string;
}

/** Find the single player entity (faction 'player'). */
export function findPlayer(world: World): string {
  for (const e of world.services.queries.with('allegiance')) {
    const a = e.components.get('allegiance') as unknown as { faction: string };
    if (a.faction === 'player') return e.id;
  }
  throw new Error('findPlayer: no player in world');
}

/** Fresh world: compose the modules, build level 1, drop the player in. */
export function newGame(seed: number): { world: World; player: string } {
  const world = createWorld({ config: gameConfig, rng: seed, modules: MODULES });
  const { level, entrance } = makeLevel(world, 1);
  const player = spawnPlayer(world, level.id, entrance);
  return { world, player: player.id };
}

/** Reload a saved world, re-composing the same modules (the engine validates the manifest). */
export function loadGame(raw: string): { world: World; player: string } {
  const world = loadWorld(raw, { config: gameConfig, modules: MODULES });
  return { world, player: findPlayer(world) };
}

export function createGame(deps: GameDeps): Game {
  let world!: World;
  let player!: string;
  let session!: Session;
  let camera!: Camera;
  let log: MessageLog | undefined;
  let lookModal: TargetingModal | undefined;
  let throwModal: TargetingModal | undefined;
  let over = false;
  let realtime = false;
  let pendingAction: Action | undefined; // buffered movement consumed by tick()

  const colors = gameConfig.ui.modal;

  function writeSave(): void {
    deps.storage.set(encodeSave(world));
  }

  /**
   * Load the saved game if one exists and is compatible, else null. The engine's
   * module manifest throws when a save was written with a different module set
   * (the game's save-compatibility key) — we discard such saves rather than load
   * a degraded world.
   */
  function tryLoad(): { world: World; player: string } | null {
    const raw = deps.storage.get();
    if (raw === null) return null;
    try {
      return loadGame(raw);
    } catch {
      deps.storage.clear();
      return null;
    }
  }

  function bind(next: { world: World; player: string }): void {
    world = next.world;
    player = next.player;
    over = false;
    lookModal = undefined;
    throwModal = undefined;
    pendingAction = undefined;
    camera = { centerOn: player };
    log?.dispose(); // stop the previous world's subscription
    const resolve: FieldResolver = (field, value) =>
      ENTITY_FIELDS.has(field) && typeof value === 'string' ? nameOf(world, value) : undefined;
    log = createMessageLog(world.services.bus, gameConfig.log.templates, { resolve });
    // No renderer is passed: the game owns rendering (renderGame) so it can lay
    // out the map/status/log as bands rather than overlay the log on the map.
    session = createSession({ world, player, viewport: deps.viewport, log, commands });
    renderGame();
  }

  function playerLevelId(): string | undefined {
    const e = world.state.entities.get(player);
    const pos = e?.components.get('position') as unknown as { levelId: string } | undefined;
    return pos?.levelId;
  }

  function bossAlive(): boolean {
    return [...world.services.queries.byTag('boss')].length > 0;
  }

  function endModal(title: string): void {
    session.pushModal(
      createListModal<string>({
        title,
        items: [{ label: 'New Game', value: 'new' }],
        onSelect: () => bind(newGame(deps.seed + 1)),
        colors,
      }),
    );
  }

  // The player is dead once the death reactor has pulled it from the timeline
  // (its corpse entity is intentionally left in the world for rendering).
  function playerDead(): boolean {
    return !world.state.timeline.actors.some((a) => a.id === player);
  }

  function checkGameOver(): void {
    if (over) return;
    if (playerDead()) {
      over = true;
      endModal('You died.  ✝');
    } else if (playerLevelId() === FINAL_LEVEL && !bossAlive()) {
      over = true;
      endModal('The Forgemaster falls.  You win!');
    }
  }

  /** The map band's viewport (the canvas minus the status row and log rows). */
  function mapBand(): Viewport {
    return { width: deps.viewport.width, height: deps.viewport.height - 1 - LOG_ROWS };
  }

  function playerLevel(): { level: Level; pos: Position } | undefined {
    const e = world.state.entities.get(player);
    const pos = e && get<Position>(e, 'position');
    const level = pos ? world.state.levels.get(pos.levelId) : undefined;
    return pos && level ? { level, pos } : undefined;
  }

  /** Enter look/examine mode: a cursor over the map band, info shown in the log band. */
  function startLook(): void {
    const pl = playerLevel();
    if (!pl) return;
    const vp = mapBand();
    const origin = viewportOrigin(world, pl.level, vp, camera);
    const modal = createTargetingModal({
      cursor: { x: pl.pos.x - origin.x, y: pl.pos.y - origin.y },
      viewport: vp,
      onConfirm: () => { lookModal = undefined; },
      onCancel: () => { lookModal = undefined; },
      colors: gameConfig.ui.targeting,
    });
    lookModal = modal;
    session.pushModal(modal);
  }

  /** Enter throw mode: aim a cursor, then fire a ranged attack at the chosen cell. */
  function startThrow(): void {
    const pl = playerLevel();
    if (!pl) return;
    const vp = mapBand();
    const origin = viewportOrigin(world, pl.level, vp, camera);
    const modal = createTargetingModal({
      cursor: { x: pl.pos.x - origin.x, y: pl.pos.y - origin.y },
      viewport: vp,
      colors: gameConfig.ui.targeting,
      onCancel: () => { throwModal = undefined; },
      onConfirm: (cur) => {
        throwModal = undefined;
        const o = viewportOrigin(world, pl.level, vp, camera);
        const lx = o.x + cur.x;
        const ly = o.y + cur.y;
        if (lx >= 0 && lx < pl.level.width && ly >= 0 && ly < pl.level.height) {
          session.submit({ type: 'ranged', actor: player, target: ly * pl.level.width + lx });
        }
      },
    });
    throwModal = modal;
    session.pushModal(modal);
  }

  function equipmentModal(): void {
    const e = world.state.entities.get(player);
    const equipped = (e?.components.get('equipped') as unknown as { slots: Record<string, string> } | undefined)?.slots ?? {};
    const items = Object.entries(equipped).map(([slot, id]) => ({ label: `${slot}: ${nameOf(world, id)}`, value: slot }));
    session.pushModal(
      createListModal<string>({
        title: items.length ? 'Equipment (select to remove)' : 'Equipment',
        items,
        onSelect: (slot) => session.submit({ type: 'unequip', actor: player, slot }),
        colors,
      }),
    );
  }

  /** Inventory listing that respects item identity (unidentified → appearance). */
  function inventoryModal(): void {
    const e = world.state.entities.get(player);
    const inv = (e?.components.get('inventory') as unknown as { items: string[] } | undefined)?.items ?? [];
    session.pushModal(
      createListModal<string>({
        title: inv.length ? 'Inventory' : 'Inventory (empty)',
        items: inv.map((id) => ({ label: nameOf(world, id), value: id })),
        onSelect: (id) => session.dispatch({ type: 'item-default', item: id }),
        colors,
      }),
    );
  }

  // --- the game's command table (merged over the session defaults) ----------
  const commands: CommandTable = {
    descend: (_cmd, ctx) => ctx.submit({ type: 'descend', actor: player }),
    ascend: (_cmd, ctx) => ctx.submit({ type: 'ascend', actor: player }),
    'open-inventory': () => inventoryModal(),
    'open-equipment': () => equipmentModal(),
    look: () => startLook(),
    throw: () => startThrow(),
    save: () => {
      writeSave();
      log?.add('Game saved.');
    },
    load: () => {
      const loaded = tryLoad();
      if (loaded) bind(loaded);
      else log?.add('No compatible save.');
    },
  };

  function titleModal(): void {
    const items = [
      { label: 'New Game (Turn-based)', value: 'new' },
      { label: 'New Game (Real-time)', value: 'rt' },
    ];
    if (deps.storage.get() !== null) items.unshift({ label: 'Continue', value: 'continue' });
    session.pushModal(
      createListModal<string>({
        title: 'D E P T H S',
        items,
        onSelect: (v) => {
          realtime = v === 'rt';
          bind((v === 'continue' && tryLoad()) || newGame(deps.seed));
        },
        colors,
      }),
    );
  }

  /** Draw the current frame: a full-screen modal, or the map/status/log bands. */
  function renderGame(): void {
    if (!deps.renderer) return;
    const cols = deps.viewport.width;
    const rows = deps.viewport.height;

    // A full-screen modal (title / inventory / equipment / death) replaces all.
    const modalFrame = session.stack.top()?.render({ width: cols, height: rows });
    if (modalFrame && !Array.isArray(modalFrame)) {
      deps.renderer.draw(modalFrame);
      return;
    }

    const mapH = rows - 1 - LOG_ROWS;
    const map = buildFrame(world, { width: cols, height: mapH }, camera);
    const cells: FrameCell[] = new Array(cols * rows);
    for (let i = 0; i < cells.length; i++) cells[i] = { glyph: ' ', fg: '#666', bg: '#000' };
    // map band (top)
    for (let i = 0; i < map.cells.length; i++) cells[i] = map.cells[i]!;

    const cursorModal = lookModal ?? throwModal;
    if (cursorModal) {
      // Cursor mode (look / throw): cursor on the map, target info in the bands.
      renderCursor(cells, cols, mapH, cursorModal, lookModal ? 'Look' : 'Throw');
    } else {
      writeRow(cells, cols, mapH, statusText(world, player), '#fe9');
      const msgs = (log?.messages() ?? []).slice(-LOG_ROWS);
      for (let i = 0; i < msgs.length; i++) writeRow(cells, cols, mapH + 1 + i, msgs[i]!, gameConfig.ui.log.fg);
    }

    deps.renderer.draw({ width: cols, height: rows, cells, overlays: [] });
  }

  /** Highlight a cursor on the map and print the targeted cell's contents. */
  function renderCursor(cells: FrameCell[], cols: number, mapH: number, modal: TargetingModal, mode: 'Look' | 'Throw'): void {
    const hint = mode === 'Throw' ? 'Throw — aim · Enter to fire · Esc' : 'Look — move cursor · Esc to exit';
    writeRow(cells, cols, mapH, hint, '#fe9');
    const cur = modal.cursor();
    const hi = cells[cur.y * cols + cur.x];
    if (hi && cur.y < mapH) cells[cur.y * cols + cur.x] = { ...hi, bg: '#640' };

    const pl = playerLevel();
    const lines: string[] = [];
    if (pl) {
      const origin = viewportOrigin(world, pl.level, { width: cols, height: mapH }, camera);
      const lx = origin.x + cur.x;
      const ly = origin.y + cur.y;
      if (lx >= 0 && lx < pl.level.width && ly >= 0 && ly < pl.level.height) {
        const d = describeCell(world, pl.level.id, ly * pl.level.width + lx);
        if (!d.visible) lines.push('Out of sight.');
        else if (d.entities.length === 0) lines.push(`${d.tile.id.replace(/_/g, ' ')} — nothing here.`);
        else for (const e of d.entities) {
          const name = displayName(world, e.id); // identity-aware (unidentified → appearance)
          lines.push(e.description ? `${name} — ${e.description}` : name);
        }
      } else {
        lines.push('Out of sight.');
      }
    }
    for (let i = 0; i < lines.length && i < LOG_ROWS; i++) {
      writeRow(cells, cols, mapH + 1 + i, lines[i]!.slice(0, cols), gameConfig.ui.log.fg);
    }
  }

  const game: Game = {
    get world() {
      return world;
    },
    get player() {
      return player;
    },
    hasSave: () => deps.storage.get() !== null,
    onCommand(cmd) {
      // Real-time, no modal open: continuous movement/wait just BUFFERS the next
      // action (consumed by the tick loop); everything else (modals, descend,
      // throw, save…) flows through the session as usual.
      if (realtime && !over && session.stack.top() === undefined) {
        const a = commandToAction(cmd, { player });
        if (a !== undefined && !isUIIntent(a)) {
          pendingAction = a;
          return;
        }
      }
      session.onCommand(cmd);
      checkGameOver();
      // `session` may have been swapped (New Game / Load) mid-command; render the
      // current one so we never leave a stale frame.
      renderGame();
    },
    render: () => renderGame(),
    realtimeActive: () => realtime && !over && session.stack.top() === undefined,
    tick(ticks) {
      if (!(realtime && !over && session.stack.top() === undefined)) return;
      const res = tickRealtime(world, { player, ticks, ...(pendingAction ? { action: pendingAction } : {}) });
      if (res.playerActed) pendingAction = undefined;
      checkGameOver();
      renderGame();
    },
    clearBuffer() {
      pendingAction = undefined;
    },
    start() {
      bind(newGame(deps.seed)); // bind() renders the world
      titleModal();
      renderGame();
    },
  };

  return game;
}

/** Write a string into a row of a flat cells array (clipped to width). */
function writeRow(cells: FrameCell[], cols: number, y: number, text: string, fg: string): void {
  for (let i = 0; i < text.length && i < cols; i++) {
    const cell = cells[y * cols + i];
    if (cell) {
      cell.glyph = text.charAt(i);
      cell.fg = fg;
    }
  }
}
