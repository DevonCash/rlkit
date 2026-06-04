/**
 * look — the "examine a tile" query (§15).
 *
 * `describeCell` is a pure read: given a cell, it reports the tile, whether the
 * cell is currently visible, and the `info` of every entity standing on it
 * (topmost-first). It is the headless half of a look/examine command — the
 * presentation (a cursor, where to print the lines) is the UI's job. Spends no
 * turn and mutates nothing, so it is a query, not a resolve-pipeline action.
 */
import { get } from '../core/entity';
import type { EntityId } from '../core/entity';
import type { Info, Item, Renderable } from '../core/component';
import type { Cell } from '../core/coords';
import { tileAt, type TileType } from '../core/level';
import type { ReadonlyWorld } from '../core/world';
import { isVisible } from './visibility';

/** One entity on the examined cell, with its display info and glyph. */
export interface CellEntityInfo {
  id: EntityId;
  name: string;
  description?: string;
  glyph?: string;
  fg?: string;
  layer: number;
}

/** What an examined cell contains: its tile, visibility, and entities. */
export interface CellDescription {
  levelId: string;
  cell: Cell;
  tile: TileType;
  visible: boolean;
  entities: CellEntityInfo[];
}

/** Display name of an entity: its `info.name`, else an item's name, else its id. */
function nameOf(world: ReadonlyWorld, id: EntityId): string {
  const e = world.state.entities.get(id);
  if (!e) return id;
  return get<Info>(e, 'info')?.name ?? get<Item>(e, 'item')?.name ?? id;
}

/**
 * Examine a cell: the tile, whether it is visible, and every entity on it
 * (topmost-first — highest `Renderable.layer`, ties by id, matching the render
 * frame's stacking). Out-of-bounds cells return no entities.
 */
export function describeCell(world: ReadonlyWorld, levelId: string, cell: Cell): CellDescription {
  const level = world.state.levels.get(levelId);
  if (!level || cell < 0 || cell >= level.width * level.height) {
    // No such cell: return an empty, non-visible description with the wall tile.
    const tile = level ? tileAt(level, 0, world.services.tiles) : world.services.tiles.byIndex(0);
    return { levelId, cell, tile, visible: false, entities: [] };
  }

  const palette = world.services.tiles;
  const entities: CellEntityInfo[] = [];
  for (const id of world.services.queries.at(cell, levelId)) {
    const e = world.state.entities.get(id);
    if (!e) continue;
    const info = get<Info>(e, 'info');
    const r = get<Renderable>(e, 'renderable');
    const entry: CellEntityInfo = { id, name: nameOf(world, id), layer: r?.layer ?? 0 };
    if (info?.description !== undefined) entry.description = info.description;
    if (r?.glyph !== undefined) entry.glyph = r.glyph;
    if (r?.fg !== undefined) entry.fg = r.fg;
    entities.push(entry);
  }
  // Topmost-first: highest layer, ties broken by smallest id (frame stacking).
  entities.sort((a, b) => (b.layer - a.layer) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { levelId, cell, tile: tileAt(level, cell, palette), visible: isVisible(level, cell), entities };
}
