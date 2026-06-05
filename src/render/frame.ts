/**
 * frame — the headless render model (§13.1).
 *
 * `buildFrame` produces a pure description of the screen — no canvas, no DOM —
 * resolving FOV visibility, layering, and "explored-but-not-visible" dimming as
 * logic; the specific colors/dim factor are config. Renderers consume it.
 *
 * Visibility tiers: VISIBLE → tile at full color, then the topmost renderable
 * (highest `Renderable.layer`, ties by entity id for determinism); EXPLORED but
 * not visible → the dimmed tile only (you remember terrain, not creatures);
 * UNSEEN → blank.
 */
import { get } from '../core/entity';
import type { Renderable } from '../core/component';
import type { Cell } from '../core/coords';
import { tileAt, type Level } from '../core/level';
import { VISIBLE_LAYER, EXPLORED_LAYER } from '../sim/visibility';
import type { ReadonlyWorld } from '../core/world';
import { cameraLevel, viewportOrigin, type Camera, type Viewport } from './camera';

export interface FrameCell {
  glyph: string;
  fg: string;
  bg: string;
}

export interface Overlay {
  cell: Cell;
  glyph?: string;
  fg?: string;
  bg?: string;
}

export interface RenderFrame {
  width: number;
  height: number;
  cells: FrameCell[]; // row-major, post-FOV
  overlays: Overlay[];
}

/** Darken a `#rgb`/`#rrggbb` color by `factor` (0..1). Non-hex passes through. */
function dim(color: string, factor: number): string {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(color);
  if (!m) return color;
  let hex = m[1]!;
  if (hex.length === 3) hex = hex[0]! + hex[0]! + hex[1]! + hex[1]! + hex[2]! + hex[2]!;
  const r = Math.round(parseInt(hex.slice(0, 2), 16) * factor);
  const g = Math.round(parseInt(hex.slice(2, 4), 16) * factor);
  const b = Math.round(parseInt(hex.slice(4, 6), 16) * factor);
  const h = (v: number) => v.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** The top renderable at a cell (highest layer; ties broken by smallest id). */
function topRenderable(world: ReadonlyWorld, level: Level, cell: Cell): Renderable | undefined {
  let best: Renderable | undefined;
  let bestId = '';
  for (const id of world.services.queries.at(cell, level.id)) {
    const e = world.state.entities.get(id);
    const r = e && get<Renderable>(e, 'renderable');
    if (!r) continue;
    if (best === undefined || r.layer > best.layer || (r.layer === best.layer && id < bestId)) {
      best = r;
      bestId = id;
    }
  }
  return best;
}

/** Which visibility layers to render through — defaults to the shared ones. */
export interface BuildFrameOptions {
  /** Layer name for "currently visible" (default `VISIBLE_LAYER`). */
  visibleLayer?: string;
  /** Layer name for "explored memory" (default `EXPLORED_LAYER`). */
  exploredLayer?: string;
}

export function buildFrame(
  world: ReadonlyWorld,
  viewport: Viewport,
  camera: Camera,
  opts: BuildFrameOptions = {},
): RenderFrame {
  const cfg = world.services.config.render;
  const blank = (): FrameCell => ({ glyph: cfg.emptyGlyph, fg: cfg.defaultFg, bg: cfg.defaultBg });

  const level = cameraLevel(world, camera);
  const cells: FrameCell[] = [];
  if (!level) {
    for (let i = 0; i < viewport.width * viewport.height; i++) cells.push(blank());
    return { width: viewport.width, height: viewport.height, cells, overlays: [] };
  }

  // Read the chosen viewer's layers directly (per-player FOV when named), so a
  // cell only shows its entities when THIS viewer sees it.
  const visLayer = level.layers.get(opts.visibleLayer ?? VISIBLE_LAYER) as Uint8Array | undefined;
  const expLayer = level.layers.get(opts.exploredLayer ?? EXPLORED_LAYER) as Uint8Array | undefined;
  const seen = (c: Cell): boolean => visLayer?.[c] === 1;
  const remembered = (c: Cell): boolean => expLayer?.[c] === 1;

  const palette = world.services.tiles;
  const origin = viewportOrigin(world, level, viewport, camera);
  for (let vy = 0; vy < viewport.height; vy++) {
    for (let vx = 0; vx < viewport.width; vx++) {
      const lx = origin.x + vx;
      const ly = origin.y + vy;
      if (lx < 0 || lx >= level.width || ly < 0 || ly >= level.height) {
        cells.push(blank());
        continue;
      }
      const cell = ly * level.width + lx;
      if (seen(cell)) {
        const tile = tileAt(level, cell, palette);
        const top = topRenderable(world, level, cell);
        cells.push(
          top
            ? { glyph: top.glyph, fg: top.fg, bg: top.bg ?? tile.bg ?? cfg.defaultBg }
            : { glyph: tile.glyph, fg: tile.fg, bg: tile.bg ?? cfg.defaultBg },
        );
      } else if (remembered(cell)) {
        const tile = tileAt(level, cell, palette);
        cells.push({
          glyph: tile.glyph,
          fg: dim(tile.fg, cfg.dim),
          bg: dim(tile.bg ?? cfg.defaultBg, cfg.dim),
        });
      } else {
        cells.push(blank());
      }
    }
  }
  return { width: viewport.width, height: viewport.height, cells, overlays: [] };
}
