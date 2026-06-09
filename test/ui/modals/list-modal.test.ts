import { describe, it, expect, vi } from 'vitest';
import { createListModal } from '../../../src/ui/modals/list-modal';
import type { Viewport } from '../../../src/render/camera';
import type { RenderFrame } from '../../../src/render/frame';

const vp: Viewport = { width: 20, height: 10 };

/** Extract the glyph text of viewport row `y` from a rendered frame. */
function rowText(f: RenderFrame, y: number): string {
  let s = '';
  for (let x = 0; x < vp.width; x++) s += f.cells[y * vp.width + x]?.glyph ?? '';
  return s;
}

describe('createListModal (§22.14)', () => {
  it('wraps the selection on up/down', () => {
    const m = createListModal({
      items: [
        { label: 'a', value: 1 },
        { label: 'b', value: 2 },
        { label: 'c', value: 3 },
      ],
      onSelect: () => {},
    });
    expect(m.selectedIndex()).toBe(0);
    m.handle({ type: 'move-south' });
    expect(m.selectedIndex()).toBe(1);
    m.handle({ type: 'move-south' });
    m.handle({ type: 'move-south' });
    expect(m.selectedIndex()).toBe(0); // 2 → wrap → 0
    m.handle({ type: 'move-north' });
    expect(m.selectedIndex()).toBe(2); // 0 → wrap → 2
  });

  it('confirm selects the highlighted value and closes', () => {
    const onSelect = vi.fn();
    const m = createListModal({
      items: [
        { label: 'a', value: 'A' },
        { label: 'b', value: 'B' },
      ],
      onSelect,
    });
    m.handle({ type: 'move-south' });
    expect(m.handle({ type: 'confirm' })).toBe('close');
    expect(onSelect).toHaveBeenCalledWith('B');
  });

  it('cancel invokes onCancel and closes; unrelated keys are consumed', () => {
    const onCancel = vi.fn();
    const m = createListModal({ items: [{ label: 'a', value: 1 }], onSelect: () => {}, onCancel });
    expect(m.handle({ type: 'pickup' })).toBe('consumed');
    expect(m.handle({ type: 'cancel' })).toBe('close');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('an empty list ignores movement and renders an (empty) marker', () => {
    const onSelect = vi.fn();
    const m = createListModal({ items: [], onSelect });
    expect(m.handle({ type: 'move-south' })).toBe('consumed');
    expect(m.selectedIndex()).toBe(0);
    // confirm on an empty list selects nothing but still closes.
    expect(m.handle({ type: 'confirm' })).toBe('close');
    expect(onSelect).not.toHaveBeenCalled();
    expect(rowText(m.render(vp), 2)).toContain('(empty)');
  });

  it('render marks the selected row only', () => {
    const m = createListModal({
      title: 'Items',
      items: [
        { label: 'sword', value: 1 },
        { label: 'shield', value: 2 },
      ],
      onSelect: () => {},
    });
    m.handle({ type: 'move-south' }); // select 'shield' (row 3)
    const f = m.render(vp);
    expect(rowText(f, 2)).toContain('sword');
    expect(rowText(f, 2)).not.toContain('>');
    expect(rowText(f, 3)).toContain('> shield');
  });
});
