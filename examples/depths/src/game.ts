/**
 * game — the game controller: world lifecycle, custom commands, and flow.
 *
 * Owns the world + session and swaps them on new-game / load. Headless: the
 * renderer and a small `Storage` port are injected, so the whole controller is
 * driven in node by the test suite and in the browser by `main.ts`.
 */
import {
  createWorld,
  loadWorld,
  encodeSave,
  createSession,
  defaultConfig,
  createListModal,
  type Config,
  type World,
  type Renderer,
  type Viewport,
  type Session,
  type CommandTable,
  type Stance,
} from 'rlkit';
import { registerGameContent } from './content';
import { makeLevel, spawnPlayer } from './dungeon';
import { MAX_DEPTH } from './biomes';

export const SAVE_KEY = 'depths-save';
const FINAL_LEVEL = `depth-${MAX_DEPTH}`;

/** Minimal persistence port (localStorage in the browser, a Map in tests). */
export interface Storage {
  get(): string | null;
  set(value: string): void;
  clear(): void;
}

/** The faction matrix + extended keymap the game runs with. */
export const gameConfig: Config = {
  ...defaultConfig,
  factions: {
    default: 'neutral' as Stance,
    matrix: { monster: { player: 'hostile' }, player: { monster: 'hostile' } },
  },
  keymap: {
    ...defaultConfig.keymap,
    '>': 'descend',
    '<': 'ascend',
    S: 'save',
    L: 'load',
    e: 'open-equipment',
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

/** Fresh world: register content, build level 1, drop the player in. */
export function newGame(seed: number): { world: World; player: string } {
  const world = createWorld({ config: gameConfig, rng: seed });
  registerGameContent(world);
  const { level, entrance } = makeLevel(world, 1);
  const player = spawnPlayer(world, level.id, entrance);
  return { world, player: player.id };
}

/** Reload a saved world and re-attach game content (tiles/effects/provider). */
export function loadGame(raw: string): { world: World; player: string } {
  const world = loadWorld(raw, { config: gameConfig });
  registerGameContent(world);
  return { world, player: findPlayer(world) };
}

export function createGame(deps: GameDeps): Game {
  let world!: World;
  let player!: string;
  let session!: Session;
  let over = false;

  const colors = gameConfig.ui.modal;

  function bind(next: { world: World; player: string }): void {
    world = next.world;
    player = next.player;
    over = false;
    session = createSession({
      world,
      player,
      ...(deps.renderer ? { renderer: deps.renderer } : {}),
      viewport: deps.viewport,
      commands,
    });
  }

  function playerLevelId(): string | undefined {
    const e = world.state.entities.get(player);
    const pos = e?.components.get('position') as { levelId: string } | undefined;
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

  function checkGameOver(): void {
    if (over) return;
    if (!world.state.entities.has(player)) {
      over = true;
      endModal('You died.  ✝');
    } else if (playerLevelId() === FINAL_LEVEL && !bossAlive()) {
      over = true;
      endModal('The Forgemaster falls.  You win!');
    }
  }

  function equipmentModal(): void {
    const e = world.state.entities.get(player);
    const equipped = (e?.components.get('equipped') as { slots: Record<string, string> } | undefined)?.slots ?? {};
    const items = Object.entries(equipped).map(([slot, id]) => {
      const it = world.state.entities.get(id);
      const name = (it?.components.get('item') as { name?: string } | undefined)?.name ?? id;
      return { label: `${slot}: ${name}`, value: slot };
    });
    session.pushModal(
      createListModal<string>({
        title: items.length ? 'Equipment (select to remove)' : 'Equipment',
        items,
        onSelect: (slot) => session.submit({ type: 'unequip', actor: player, slot }),
        colors,
      }),
    );
  }

  // --- the game's command table (merged over the session defaults) ----------
  const commands: CommandTable = {
    descend: (_cmd, ctx) => ctx.submit({ type: 'descend', actor: player }),
    ascend: (_cmd, ctx) => ctx.submit({ type: 'ascend', actor: player }),
    'open-equipment': () => equipmentModal(),
    save: () => {
      deps.storage.set(encodeSave(world));
    },
    load: () => {
      const raw = deps.storage.get();
      if (raw) bind(loadGame(raw));
    },
  };

  function titleModal(): void {
    const items = [{ label: 'New Game', value: 'new' }];
    if (deps.storage.get()) items.unshift({ label: 'Continue', value: 'continue' });
    session.pushModal(
      createListModal<string>({
        title: 'D E P T H S',
        items,
        onSelect: (v) => {
          if (v === 'continue') {
            const raw = deps.storage.get();
            if (raw) bind(loadGame(raw));
          } else {
            bind(newGame(deps.seed));
          }
        },
        colors,
      }),
    );
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
      session.onCommand(cmd);
      checkGameOver();
    },
    render: () => session.render(),
    start() {
      // Build an initial world so a session/renderer exists, then overlay title.
      bind(newGame(deps.seed));
      titleModal();
      session.render();
    },
  };

  return game;
}
