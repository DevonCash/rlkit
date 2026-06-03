import { describe, it, expect, vi } from 'vitest';
import { createListModal } from '../../src/ui/modals/list-modal';
import { createTargetingModal } from '../../src/ui/modals/targeting-modal';
import { createUIStack } from '../../src/ui/stack';

const viewport = { width: 20, height: 10 };

describe('ListModal (§15)', () => {
  it('moves the selection and fires onSelect on confirm', () => {
    const onSelect = vi.fn();
    const modal = createListModal({
      title: 'Pack',
      items: [
        { label: 'sword', value: 'a' },
        { label: 'potion', value: 'b' },
        { label: 'scroll', value: 'c' },
      ],
      onSelect,
    });
    expect(modal.selectedIndex()).toBe(0);
    expect(modal.handle({ type: 'move-south' })).toBe('consumed');
    expect(modal.selectedIndex()).toBe(1);
    expect(modal.handle({ type: 'move-north' })).toBe('consumed');
    expect(modal.selectedIndex()).toBe(0);
    expect(modal.handle({ type: 'confirm' })).toBe('close');
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('renders a full-screen frame with the selection marker', () => {
    const modal = createListModal({ items: [{ label: 'sword', value: 'a' }], onSelect: () => {} });
    const frame = modal.render(viewport);
    expect('cells' in frame).toBe(true);
    if (!Array.isArray(frame)) {
      const row2 = frame.cells.slice(2 * viewport.width, 3 * viewport.width).map((c) => c.glyph).join('');
      expect(row2).toContain('> sword');
    }
  });
});

describe('TargetingModal (§15)', () => {
  it('moves the cursor and previews an AoE shape; confirm delivers the cell', () => {
    const onConfirm = vi.fn();
    const modal = createTargetingModal({ cursor: { x: 5, y: 5 }, shape: { kind: 'blast', radius: 1 }, onConfirm });
    modal.handle({ type: 'move-east' });
    expect(modal.cursor()).toEqual({ x: 6, y: 5 });

    const overlays = modal.render(viewport);
    expect(Array.isArray(overlays)).toBe(true);
    if (Array.isArray(overlays)) {
      // cursor glyph present + blast preview cells around it
      expect(overlays.some((o) => o.glyph === '*' && o.cell === 5 * viewport.width + 6)).toBe(true);
      expect(overlays.length).toBeGreaterThan(1);
    }

    expect(modal.handle({ type: 'confirm' })).toBe('close');
    expect(onConfirm).toHaveBeenCalledWith({ x: 6, y: 5 });
  });
});

describe('UIStack', () => {
  it('pushes/pops/tops in order', () => {
    const stack = createUIStack();
    const a = createListModal({ items: [], onSelect: () => {} });
    const b = createListModal({ items: [], onSelect: () => {} });
    stack.push(a);
    stack.push(b);
    expect(stack.top()).toBe(b);
    expect(stack.size).toBe(2);
    expect(stack.pop()).toBe(b);
    expect(stack.top()).toBe(a);
  });
});
