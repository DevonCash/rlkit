/**
 * list-modal — a generic data-driven list menu (§15).
 *
 * Backs inventory, equipment, and any menu: takes labeled items + a select
 * callback, renders a full-screen `RenderFrame`, and handles up/down/confirm/
 * cancel. Games don't reimplement menu plumbing.
 */
import type { Modal, ModalResult } from '../stack';
import type { Viewport } from '../../render/camera';
import type { RenderFrame, FrameCell } from '../../render/frame';
import { blankCells, writeText } from '../composite';

export interface ListItem<T> {
  label: string;
  value: T;
}

/** Modal palette (config-surfaced; §15 "Layout is config"). */
export interface ModalColors {
  bg: string;
  fg: string;
  title: string;
  selected: string;
  muted: string;
}

const DEFAULT_MODAL_COLORS: ModalColors = {
  bg: '#001',
  fg: '#888',
  title: '#ff0',
  selected: '#fff',
  muted: '#aaa',
};

export interface ListModalOptions<T> {
  title?: string;
  items: ListItem<T>[];
  onSelect(value: T): void;
  onCancel?(): void;
  colors?: ModalColors;
}

export interface ListModal extends Modal {
  /** The highlighted index (for tests/inspection). */
  selectedIndex(): number;
}

export function createListModal<T>(opts: ListModalOptions<T>): ListModal {
  let selected = 0;
  const count = opts.items.length;
  const c = opts.colors ?? DEFAULT_MODAL_COLORS;
  const bg: FrameCell = { glyph: ' ', fg: c.fg, bg: c.bg };

  return {
    selectedIndex: () => selected,
    render(viewport: Viewport): RenderFrame {
      const cells = blankCells(viewport, bg);
      writeText(cells, viewport, 1, 0, opts.title ?? 'Menu', c.title);
      opts.items.forEach((item, i) => {
        const marker = i === selected ? '> ' : '  ';
        writeText(cells, viewport, 1, 2 + i, marker + item.label, i === selected ? c.selected : c.muted);
      });
      if (count === 0) writeText(cells, viewport, 1, 2, '(empty)', c.muted);
      return { width: viewport.width, height: viewport.height, cells, overlays: [] };
    },
    handle(cmd): ModalResult {
      switch (cmd.type) {
        case 'move-north':
          if (count > 0) selected = (selected - 1 + count) % count;
          return 'consumed';
        case 'move-south':
          if (count > 0) selected = (selected + 1) % count;
          return 'consumed';
        case 'confirm': {
          const item = opts.items[selected];
          if (item) opts.onSelect(item.value);
          return 'close';
        }
        case 'cancel':
          opts.onCancel?.();
          return 'close';
        default:
          return 'consumed'; // a menu swallows everything else
      }
    },
  };
}
