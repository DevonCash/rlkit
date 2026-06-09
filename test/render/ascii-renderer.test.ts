import { describe, it, expect } from 'vitest';
import { AsciiRenderer } from '../../src/render/ascii-renderer';
import type { RenderFrame, FrameCell } from '../../src/render/frame';

function cell(glyph: string): FrameCell {
  return { glyph, fg: '#fff', bg: '#000' };
}
function frame(width: number, height: number, glyphs: string[]): RenderFrame {
  return { width, height, cells: glyphs.map(cell), overlays: [] };
}

describe('AsciiRenderer (§22.14)', () => {
  it('renders cells row-major into text rows', () => {
    const r = new AsciiRenderer();
    r.draw(frame(3, 2, ['a', 'b', 'c', 'd', 'e', 'f']));
    expect(r.rows).toEqual(['abc', 'def']);
    expect(r.toString()).toBe('abc\ndef');
  });

  it('substitutes a space for empty or missing glyphs', () => {
    const r = new AsciiRenderer();
    // width 3 but only two cells supplied; the second has an empty glyph.
    const f: RenderFrame = { width: 3, height: 1, cells: [cell('x'), cell('')], overlays: [] };
    r.draw(f);
    expect(r.rows).toEqual(['x  ']); // 'x', empty→' ', missing→' '
  });

  it('redraw replaces the previous frame', () => {
    const r = new AsciiRenderer();
    r.draw(frame(1, 1, ['a']));
    r.draw(frame(1, 1, ['b']));
    expect(r.toString()).toBe('b');
  });
});
