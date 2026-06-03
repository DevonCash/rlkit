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

export interface ListModalOptions<T> {
  title?: string;
  items: ListItem<T>[];
  onSelect(value: T): void;
  onCancel?(): void;
}

export interface ListModal<T> extends Modal {
  /** The highlighted index (for tests/inspection). */
  selectedIndex(): number;
}

const BG: FrameCell = { glyph: ' ', fg: '#888', bg: '#001' };

export function createListModal<T>(opts: ListModalOptions<T>): ListModal<T> {
  let selected = 0;
  const count = opts.items.length;

  return {
    selectedIndex: () => selected,
    render(viewport: Viewport): RenderFrame {
      const cells = blankCells(viewport, BG);
      writeText(cells, viewport, 1, 0, opts.title ?? 'Menu', '#ff0');
      opts.items.forEach((item, i) => {
        const marker = i === selected ? '> ' : '  ';
        writeText(cells, viewport, 1, 2 + i, marker + item.label, i === selected ? '#fff' : '#aaa');
      });
      if (count === 0) writeText(cells, viewport, 1, 2, '(empty)', '#666');
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
