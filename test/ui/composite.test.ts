import { describe, it, expect } from 'vitest';
import { blankCells, writeText, textOverlays, composite } from '../../src/ui/composite';
import type { Viewport } from '../../src/render/camera';
import type { RenderFrame, FrameCell } from '../../src/render/frame';

const vp: Viewport = { width: 5, height: 3 };
const fill: FrameCell = { glyph: '.', fg: '#fff', bg: '#000' };

describe('composite helpers (§22.14)', () => {
  it('blankCells produces width*height independent cells', () => {
    const cells = blankCells(vp, fill);
    expect(cells).toHaveLength(15);
    cells[0]!.glyph = 'X';
    expect(cells[1]!.glyph).toBe('.'); // distinct copies, not shared refs
  });

  it('writeText writes within bounds and clips overflow', () => {
    const cells = blankCells(vp, fill);
    writeText(cells, vp, 1, 1, 'AB', '#0f0');
    expect(cells[1 * 5 + 1]!.glyph).toBe('A');
    expect(cells[1 * 5 + 2]!.glyph).toBe('B');
    expect(cells[1 * 5 + 1]!.fg).toBe('#0f0');

    // An off-screen row is a no-op.
    writeText(cells, vp, 0, 9, 'Z', '#f00');
    expect(cells.every((c) => c.glyph !== 'Z')).toBe(true);

    // Horizontal overflow past the right edge is dropped.
    writeText(cells, vp, 4, 0, 'PQ', '#fff');
    expect(cells[0 * 5 + 4]!.glyph).toBe('P');
    expect(cells.filter((c) => c.glyph === 'Q')).toHaveLength(0);
  });

  it('composite applies overlay glyph/fg/bg onto a copy, leaving the source intact', () => {
    const frame: RenderFrame = { width: 5, height: 3, cells: blankCells(vp, fill), overlays: [] };
    const out = composite(frame, [{ cell: 7, glyph: '@', fg: '#ff0', bg: '#111' }]);
    expect(out.cells[7]!.glyph).toBe('@');
    expect(out.cells[7]!.bg).toBe('#111');
    expect(frame.cells[7]!.glyph).toBe('.'); // source frame untouched
    expect(out.overlays).toEqual([]);
  });

  it('composite ignores out-of-range overlay cells', () => {
    const frame: RenderFrame = { width: 5, height: 3, cells: blankCells(vp, fill), overlays: [] };
    expect(() => composite(frame, [{ cell: 999, glyph: '@' }])).not.toThrow();
  });

  it('textOverlays emits one overlay per in-bounds glyph', () => {
    // 'H' at x=4 is in bounds; 'i' at x=5 is out of bounds and dropped.
    expect(textOverlays('Hi', 4, 0, vp, '#fff')).toEqual([{ cell: 4, glyph: 'H', fg: '#fff' }]);
  });
});
