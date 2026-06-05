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
import type { World } from '../core/world';
import type { EntityId } from '../core/entity';
import type { Action } from '../core/action';
import { tickRealtimeMulti } from '../sim/driver';
import { encodeState } from '../adapters/storage';

export interface GameServerOptions {
  world: World;
  /** Spawn a new player actor (blueprint, entrance, timeline) and return its id. */
  spawnPlayer: (world: World) => EntityId;
  /** Remove a leaving player. Defaults to: unschedule, unindex, delete. */
  removePlayer?: (world: World, id: EntityId) => void;
}

/** The result of one server tick — what a transport fans out to clients. */
export interface ServerUpdate {
  worldClock: number;
  /** Players who took a turn this tick. */
  acted: EntityId[];
  /** True once every player has left the timeline (co-op game over). */
  idle: boolean;
}

export interface GameServer {
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

export function createGameServer(opts: GameServerOptions): GameServer {
  const { world, spawnPlayer } = opts;
  const remove = opts.removePlayer ?? defaultRemove;
  const players = new Set<EntityId>();
  const buffers = new Map<EntityId, Action>();

  const server: GameServer = {
    world,
    players,
    join() {
      const id = spawnPlayer(world);
      players.add(id);
      return id;
    },
    leave(id) {
      players.delete(id);
      buffers.delete(id);
      remove(world, id);
    },
    enqueue(id, action) {
      if (players.has(id)) buffers.set(id, action);
    },
    tick(ticks) {
      const res = tickRealtimeMulti(world, {
        players,
        actionFor: (id) => buffers.get(id),
        ticks,
      });
      for (const id of res.acted) buffers.delete(id); // one-shot
      return { worldClock: res.worldClock, acted: res.acted, idle: res.idle };
    },
    snapshot() {
      world.state.rng = world.services.rng.getState();
      return encodeState(world.state);
    },
  };
  return server;
}
