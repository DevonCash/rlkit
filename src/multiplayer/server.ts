/**
 * multiplayer/server — the authoritative co-op session (§6.5).
 *
 * A headless, transport-agnostic host: it owns one `World`, accepts player joins
 * and buffered action intents, advances a real-time tick over the shared
 * timeline, and exposes a snapshot for join/reconnect. There are NO sockets and
 * no DOM here — a transport (WebSocket, Durable Object, in-process channel) just
 * pipes messages to `join`/`enqueue`/`leave` and calls `tick` on a clock.
 *
 * It reuses the engine wholesale: `tickRealtimeMulti` resolves every player's
 * action in deterministic timeline order with shared (union) fog, the event bus
 * is the delta stream, and `encodeState`/`decodeState` is the snapshot.
 */
import { get } from '../core/entity';
import type { World } from '../core/world';
import type { EntityId } from '../core/entity';
import type { Action } from '../core/action';
import type { Cell } from '../core/coords';
import type { GameEvent } from '../core/events';
import type { Resources } from '../core/component';
import { tickRealtimeMulti } from '../sim/driver';
import { deriveStat } from '../sim/stats';
import { computeVisibilityFor, visibleLayerFor, exploredLayerFor, canViewerSee } from '../sim/visibility';
import { buildFrame, type RenderFrame } from '../render/frame';
import type { Viewport } from '../render/camera';
import { encodeState } from '../adapters/storage';

export interface GameServerOptions<E = unknown> {
  world: World;
  /** Spawn a new player actor (blueprint, entrance, timeline) and return its id. */
  spawnPlayer: (world: World) => EntityId;
  /** Remove a leaving player. Defaults to: unschedule, unindex, delete. */
  removePlayer?: (world: World, id: EntityId) => void;
  /**
   * Visibility model. `'shared'` (default) — every client renders the union of
   * all players' fog. `'hidden'` — each client renders only its own player's FOV
   * (competitive / anti-cheat): `viewFor` returns a frame with unseen entities
   * already absent, so the wire payload leaks nothing.
   */
  fog?: 'shared' | 'hidden';
  /**
   * Game-supplied HUD extension (§6.5, R6): build a per-player payload (O₂, role,
   * round clock, held item, …) carried on `PlayerView.extra`. Called once per
   * `viewFor`. CONTRACT: read only the viewer's own state — under hidden fog the
   * engine won't otherwise leak another player's extras.
   */
  viewExtra?: (world: World, playerId: EntityId) => E;
}

/** The per-player render payload a transport sends to ONE client. */
export interface PlayerView<E = unknown> {
  /** Pre-rendered frame through this player's visibility (the anti-cheat unit). */
  frame: RenderFrame;
  hp?: { current: number; max: number };
  /** False once this player has left the timeline (death). */
  alive: boolean;
  /** The game-supplied HUD extension from `viewExtra`, if any. */
  extra?: E;
}

/** The result of one server tick — what a transport fans out to clients. */
export interface ServerUpdate {
  worldClock: number;
  /** Players who took a turn this tick. */
  acted: EntityId[];
  /** True once every player has left the timeline (co-op game over). */
  idle: boolean;
  /**
   * The `GameEvent`s emitted during this tick, in order (§6.5). The transport
   * fans them out — under hidden fog, filter per player with {@link GameServer.canViewerSee}
   * (visual perception) and game-side hearing checks before sending.
   */
  events: GameEvent[];
}

export interface GameServer<E = unknown> {
  /** The authoritative world (in-process clients render from it directly). */
  readonly world: World;
  readonly players: ReadonlySet<EntityId>;
  /** Add a player; returns its id. */
  join(): EntityId;
  /** Remove a player. */
  leave(id: EntityId): void;
  /** Buffer a player's next action (consumed on its next turn). */
  enqueue(id: EntityId, action: Action): void;
  /** Advance the shared world by `ticks` world-ticks and report what happened. */
  tick(ticks: number): ServerUpdate;
  /** A player's render payload — what the transport sends only to that client. */
  viewFor(id: EntityId, viewport: Viewport): PlayerView<E>;
  /**
   * Does player `id` currently see `cell` (visual/line-of-sight, per its own fog)?
   * The transport uses this to filter which tick events a player perceives; ghost
   * / all-seeing and hearing-radius checks compose game-side.
   */
  canViewerSee(id: EntityId, cell: Cell): boolean;
  /** A snapshot string for a (re)joining client to mirror. */
  snapshot(): string;
}

function defaultRemove(world: World, id: EntityId): void {
  const e = world.state.entities.get(id);
  if (!e) return;
  world.services.timeline.remove(id);
  world.services.queries.unindex(e);
  world.state.entities.delete(id);
}

export function createGameServer<E = unknown>(opts: GameServerOptions<E>): GameServer<E> {
  const { world, spawnPlayer } = opts;
  const remove = opts.removePlayer ?? defaultRemove;
  const fog = opts.fog ?? 'shared';
  const players = new Set<EntityId>();
  const buffers = new Map<EntityId, Action>();

  // Tap every event so a tick can report the ordered stream it produced.
  const eventBuffer: GameEvent[] = [];
  world.services.bus.onAny((ev) => eventBuffer.push(ev));

  const server: GameServer<E> = {
    world,
    players,
    join() {
      const id = spawnPlayer(world);
      players.add(id);
      if (fog === 'hidden') computeVisibilityFor(world, id); // seed the new player's FOV
      return id;
    },
    leave(id) {
      players.delete(id);
      buffers.delete(id);
      remove(world, id);
      // Drop this player's per-level visibility layers so they don't accumulate.
      const vis = visibleLayerFor(id);
      const exp = exploredLayerFor(id);
      for (const level of world.state.levels.values()) {
        level.layers.delete(vis);
        level.layers.delete(exp);
      }
    },
    enqueue(id, action) {
      if (players.has(id)) buffers.set(id, action);
    },
    tick(ticks) {
      eventBuffer.length = 0; // capture only this tick's events
      const res = tickRealtimeMulti(world, {
        players,
        actionFor: (id) => buffers.get(id),
        ticks,
        updateFog: fog === 'shared', // hidden mode manages its own per-player fog below
      });
      for (const id of res.acted) buffers.delete(id); // one-shot
      // Hidden fog: a player's FOV only changes when it moves, so recompute just
      // the movers (joins are seeded in `join`).
      if (fog === 'hidden') for (const id of res.acted) computeVisibilityFor(world, id);
      return { worldClock: res.worldClock, acted: res.acted, idle: res.idle, events: eventBuffer.slice() };
    },
    viewFor(id, viewport) {
      const layers =
        fog === 'hidden' ? { visibleLayer: visibleLayerFor(id), exploredLayer: exploredLayerFor(id) } : {};
      const frame = buildFrame(world, viewport, { centerOn: id }, layers);
      const e = world.state.entities.get(id);
      const pool = e && get<Resources>(e, 'resources')?.pools.hp;
      const alive = world.state.timeline.actors.some((a) => a.id === id);
      return {
        frame,
        alive,
        ...(e && pool ? { hp: { current: pool.current, max: deriveStat(e, world, 'max-hp') } } : {}),
        ...(opts.viewExtra ? { extra: opts.viewExtra(world, id) } : {}),
      };
    },
    canViewerSee(id, cell) {
      return canViewerSee(world, id, cell);
    },
    snapshot() {
      world.state.rng = world.services.rng.getState();
      return encodeState(world.state);
    },
  };
  return server;
}
