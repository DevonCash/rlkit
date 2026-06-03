/**
 * bsp — recursive binary-space-partition dungeon generator (§8.2).
 *
 * Recursively splits the map into a tree of partitions, carves one room per
 * leaf, and connects sibling partitions with L-corridors as the recursion
 * unwinds — so the whole tree is connected by construction. Pure: every choice
 * is drawn from the injected RNG, so a seed reproduces the map exactly.
 *
 * Tile convention: index 0 = wall (palette guarantee); the floor index is
 * supplied via `params.floorIndex` (default 1) by `buildLevel`.
 */
import { cellOf } from '../core/coords';
import type { RNG } from '../core/rng';
import type { GenParams, GeneratedMap, MapGenerator, Region, Edge } from './generator';

const WALL = 0;

interface Partition {
  x: number;
  y: number;
  width: number;
  height: number;
}

function center(r: Region): { x: number; y: number } {
  return { x: r.x + (r.width >> 1), y: r.y + (r.height >> 1) };
}

export function generateBsp(params: GenParams, rng: RNG): GeneratedMap {
  const { width, height } = params;
  const floor = (params.floorIndex as number | undefined) ?? 1;
  const minRoom = (params.minRoomSize as number | undefined) ?? 5;
  const maxDepth = (params.maxDepth as number | undefined) ?? 5;
  // A partition must hold a room (minRoom) plus a one-cell wall border.
  const minLeaf = minRoom + 2;

  const tiles = new Uint16Array(width * height).fill(WALL);
  const rooms: Region[] = [];
  const connections: Edge[] = [];

  const carveRoom = (r: Region): void => {
    for (let y = r.y; y < r.y + r.height; y++) {
      for (let x = r.x; x < r.x + r.width; x++) {
        tiles[cellOf({ x, y }, width)] = floor;
      }
    }
  };

  const carveH = (x0: number, x1: number, y: number): void => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      tiles[cellOf({ x, y }, width)] = floor;
    }
  };
  const carveV = (y0: number, y1: number, x: number): void => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      tiles[cellOf({ x, y }, width)] = floor;
    }
  };

  const connect = (aIdx: number, bIdx: number): void => {
    const a = center(rooms[aIdx]!);
    const b = center(rooms[bIdx]!);
    // L-corridor; order chosen by RNG for variety.
    if (rng.int(0, 1) === 0) {
      carveH(a.x, b.x, a.y);
      carveV(a.y, b.y, b.x);
    } else {
      carveV(a.y, b.y, a.x);
      carveH(a.x, b.x, b.y);
    }
    connections.push({ a: aIdx, b: bIdx });
  };

  // Build a room inside a leaf partition; returns its room index.
  const makeRoom = (p: Partition): number => {
    const maxW = p.width - 2;
    const maxH = p.height - 2;
    const w = Math.max(minRoom, rng.int(minRoom, Math.max(minRoom, maxW)));
    const h = Math.max(minRoom, rng.int(minRoom, Math.max(minRoom, maxH)));
    const rw = Math.min(w, maxW);
    const rh = Math.min(h, maxH);
    const rx = p.x + 1 + rng.int(0, Math.max(0, p.width - 2 - rw));
    const ry = p.y + 1 + rng.int(0, Math.max(0, p.height - 2 - rh));
    const room: Region = { x: rx, y: ry, width: rw, height: rh };
    carveRoom(room);
    rooms.push(room);
    return rooms.length - 1;
  };

  // Recurse: returns the representative room index of this subtree.
  const split = (p: Partition, depth: number): number => {
    const canH = p.height >= 2 * minLeaf;
    const canV = p.width >= 2 * minLeaf;
    if (depth >= maxDepth || (!canH && !canV)) {
      return makeRoom(p);
    }
    // Choose split orientation: prefer splitting the longer axis.
    let horizontal: boolean;
    if (canH && canV) horizontal = p.height > p.width ? true : p.width > p.height ? false : rng.int(0, 1) === 0;
    else horizontal = canH;

    let left: Partition;
    let right: Partition;
    if (horizontal) {
      const cut = rng.int(minLeaf, p.height - minLeaf);
      left = { x: p.x, y: p.y, width: p.width, height: cut };
      right = { x: p.x, y: p.y + cut, width: p.width, height: p.height - cut };
    } else {
      const cut = rng.int(minLeaf, p.width - minLeaf);
      left = { x: p.x, y: p.y, width: cut, height: p.height };
      right = { x: p.x + cut, y: p.y, width: p.width - cut, height: p.height };
    }
    const a = split(left, depth + 1);
    const b = split(right, depth + 1);
    connect(a, b);
    return a;
  };

  split({ x: 0, y: 0, width, height }, 0);

  const entrance = rooms.length > 0 ? cellOf(center(rooms[0]!), width) : 0;

  return {
    width,
    height,
    tiles,
    regions: rooms,
    connections,
    spawnHints: [{ kind: 'entrance', cell: entrance }],
  };
}

export const bsp: MapGenerator = {
  id: 'bsp',
  generate: generateBsp,
};
