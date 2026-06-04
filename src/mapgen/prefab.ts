/**
 * prefab — hand-authored room/vault templates: parse, stamp, and place (§8.2).
 *
 * A `Prefab` is an ASCII grid ('#'/space = wall, '.' = floor, '+' = a door
 * anchor that is also floor). `parsePrefab` normalizes rows and records anchor
 * cells in row-major order. `stampPrefab` writes a prefab into a tile grid at an
 * origin and returns the absolute anchor cells — the composition primitive that
 * lets a vault be dropped onto a map from any other generator. `generatePrefab`
 * scatters non-overlapping prefabs on an all-wall grid and leaves the corridors
 * to `decorate`'s mutate-to-connect, so every seed yields a reachable level.
 *
 * Generators are runtime (not persisted), so `Prefab` is a plain interface, not
 * a Zod schema. Tile convention: index 0 = wall; floor from `params.floorIndex`.
 */
import type { Cell } from '../core/coords';
import type { RNG } from '../core/rng';
import type { GenParams, GeneratedMap, MapGenerator, Region } from './generator';

const WALL = 0;
/** Attempt-count divisor over map area — a bounded, area-proportional cap. */
const ATTEMPTS_PER_AREA = 64;

/** A parsed room/vault template. `anchors` are prefab-LOCAL cells (`y*width+x`). */
export interface Prefab {
  width: number;
  height: number;
  /** Rows normalized to `width` (padded with wall chars). */
  rows: string[];
  anchors: Cell[];
}

function isWallChar(ch: string): boolean {
  return ch === '#' || ch === ' ' || ch === '';
}

/** Parse ASCII rows into a {@link Prefab}. Ragged rows pad as wall; throws if empty. */
export function parsePrefab(rows: string[]): Prefab {
  if (rows.length === 0) throw new Error('parsePrefab: empty template');
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  if (width === 0) throw new Error('parsePrefab: zero-width template');
  const height = rows.length;
  const norm: string[] = [];
  const anchors: Cell[] = [];
  for (let y = 0; y < height; y++) {
    const row = rows[y]!.padEnd(width, '#');
    norm.push(row);
    for (let x = 0; x < width; x++) {
      if (row[x] === '+') anchors.push(y * width + x);
    }
  }
  return { width, height, rows: norm, anchors };
}

/**
 * Stamp `prefab` into `tiles` at absolute `(originX, originY)`. Returns the
 * prefab's anchor cells as ABSOLUTE cells (row-major order). Throws if the
 * stamp would fall outside the grid (the caller picks fitting origins).
 */
export function stampPrefab(
  tiles: Uint16Array,
  mapWidth: number,
  prefab: Prefab,
  originX: number,
  originY: number,
  opts: { floorIndex: number; wallIndex: number },
): Cell[] {
  const mapHeight = tiles.length / mapWidth;
  if (originX < 0 || originY < 0 || originX + prefab.width > mapWidth || originY + prefab.height > mapHeight) {
    throw new Error('stampPrefab: stamp out of bounds');
  }
  for (let ly = 0; ly < prefab.height; ly++) {
    const row = prefab.rows[ly]!;
    for (let lx = 0; lx < prefab.width; lx++) {
      const cell = (originY + ly) * mapWidth + (originX + lx);
      tiles[cell] = isWallChar(row[lx] ?? '#') ? opts.wallIndex : opts.floorIndex;
    }
  }
  return prefab.anchors.map((a) => {
    const lx = a % prefab.width;
    const ly = (a / prefab.width) | 0;
    return (originY + ly) * mapWidth + (originX + lx);
  });
}

/** Built-in templates so `buildLevel({ generator: 'prefab' })` works with no content. */
export const DEFAULT_PREFABS: readonly string[][] = [
  ['#####', '#...#', '+...+', '#...#', '#####'],
  ['#######', '#.....#', '#.....#', '+.....+', '#.....#', '#######'],
  ['####', '#..+', '#..#', '####'],
];

function asPrefab(t: string[] | Prefab): Prefab {
  return Array.isArray(t) ? parsePrefab(t) : t;
}

function overlaps(a: Region, b: Region): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function generatePrefab(params: GenParams, rng: RNG): GeneratedMap {
  const { width, height } = params;
  const floor = (params.floorIndex as number | undefined) ?? 1;
  const templates = (params.prefabs as (string[] | Prefab)[] | undefined) ?? (DEFAULT_PREFABS as unknown as string[][]);

  // Only keep prefabs that fit inside the 1-cell wall border.
  const fit = templates.map(asPrefab).filter((pf) => pf.width <= width - 2 && pf.height <= height - 2);

  const tiles = new Uint16Array(width * height).fill(WALL);
  const placed: Region[] = [];
  const doorCells: Cell[] = [];

  if (fit.length > 0) {
    const attempts = Math.max(8, Math.floor((width * height) / ATTEMPTS_PER_AREA));
    for (let i = 0; i < attempts; i++) {
      // Draw idx → x → y first (stable order), then test fit/overlap.
      const pf = fit[rng.int(0, fit.length - 1)]!;
      const ox = rng.int(1, width - 1 - pf.width);
      const oy = rng.int(1, height - 1 - pf.height);
      const region: Region = { x: ox, y: oy, width: pf.width, height: pf.height };
      if (placed.some((r) => overlaps(region, r))) continue;
      const anchors = stampPrefab(tiles, width, pf, ox, oy, { floorIndex: floor, wallIndex: WALL });
      placed.push(region);
      doorCells.push(...anchors);
    }
  }

  // Entrance: first door anchor, else first room center, else forced center.
  let entrance: Cell;
  if (doorCells.length > 0) {
    entrance = doorCells[0]!;
  } else if (placed.length > 0) {
    const r = placed[0]!;
    entrance = (r.y + (r.height >> 1)) * width + (r.x + (r.width >> 1));
  } else {
    entrance = (height >> 1) * width + (width >> 1);
    tiles[entrance] = floor;
  }

  return {
    width,
    height,
    tiles,
    regions: placed,
    spawnHints: [
      { kind: 'entrance', cell: entrance },
      ...doorCells.map((cell) => ({ kind: 'door', cell })),
    ],
  };
}

export const prefab: MapGenerator = {
  id: 'prefab',
  generate: generatePrefab,
};
