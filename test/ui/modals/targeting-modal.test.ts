import { describe, it, expect, vi } from 'vitest';
import { createTargetingModal } from '../../../src/ui/modals/targeting-modal';
import type { Viewport } from '../../../src/render/camera';

const vp: Viewport = { width: 10, height: 8 };

describe('createTargetingModal (§22.14)', () => {
  it('moves the cursor by movement commands once bounds are known', () => {
    const m = createTargetingModal({ cursor: { x: 5, y: 4 }, onConfirm: () => {} });
    m.render(vp); // establishes viewport bounds
    m.handle({ type: 'move-east' });
    expect(m.cursor()).toEqual({ x: 6, y: 4 });
    m.handle({ type: 'move-north' });
    expect(m.cursor()).toEqual({ x: 6, y: 3 });
  });

  it('clamps the cursor to the viewport bounds', () => {
    const m = createTargetingModal({ cursor: { x: 0, y: 0 }, onConfirm: () => {}, viewport: vp });
    m.handle({ type: 'move-west' });
    m.handle({ type: 'move-north' });
    expect(m.cursor()).toEqual({ x: 0, y: 0 }); // clamped at the lower bound
    for (let i = 0; i < 20; i++) {
      m.handle({ type: 'move-east' });
      m.handle({ type: 'move-south' });
    }
    expect(m.cursor()).toEqual({ x: 9, y: 7 }); // clamped at (width-1, height-1)
  });

  it('confirm delivers a copy of the cursor and closes; cancel closes', () => {
    const onConfirm = vi.fn();
    const m = createTargetingModal({ cursor: { x: 2, y: 3 }, onConfirm, viewport: vp });
    expect(m.handle({ type: 'confirm' })).toBe('close');
    expect(onConfirm).toHaveBeenCalledWith({ x: 2, y: 3 });

    const onCancel = vi.fn();
    const m2 = createTargetingModal({ cursor: { x: 0, y: 0 }, onConfirm: () => {}, onCancel, viewport: vp });
    expect(m2.handle({ type: 'cancel' })).toBe('close');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('renders a cursor overlay, plus a shape preview when a shape is given', () => {
    const m = createTargetingModal({
      cursor: { x: 4, y: 4 },
      shape: { kind: 'blast', radius: 1 },
      onConfirm: () => {},
    });
    const overlays = m.render(vp);
    const cursorCell = 4 * vp.width + 4;
    expect(overlays.some((o) => o.cell === cursorCell && o.glyph === '*')).toBe(true);
    // A radius-1 blast contributes extra background overlays around the cursor.
    expect(overlays.length).toBeGreaterThan(1);
  });
});
