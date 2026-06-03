import { describe, it, expect } from 'vitest';
import {
  createComponentRegistry,
  registerCoreComponents,
  parseComponent,
  Position,
  type Position as PositionT,
} from '../../src/core/component';

describe('component (schema-first validation)', () => {
  it('accepts a valid component and infers its type', () => {
    const reg = createComponentRegistry();
    registerCoreComponents(reg);
    const value: unknown = { type: 'position', x: 3, y: 4, levelId: 'L1' };
    const parsed = parseComponent(reg, value) as PositionT;
    expect(parsed).toEqual({ type: 'position', x: 3, y: 4, levelId: 'L1' });
    // Type-level: Position.parse yields a fully-typed Position.
    const direct = Position.parse(value);
    expect(direct.x + direct.y).toBe(7);
  });

  it('rejects a value that does not match the schema', () => {
    const reg = createComponentRegistry();
    registerCoreComponents(reg);
    // x must be an integer; levelId missing.
    expect(() => parseComponent(reg, { type: 'position', x: 1.5 })).toThrow();
    expect(() =>
      parseComponent(reg, { type: 'renderable', glyph: '@', fg: '#fff' }),
    ).toThrow(); // layer missing
  });

  it('rejects unknown component types and non-components', () => {
    const reg = createComponentRegistry();
    registerCoreComponents(reg);
    expect(() => parseComponent(reg, { type: 'nope' })).toThrow(/unknown id/);
    expect(() => parseComponent(reg, 42)).toThrow(/not a component/);
    expect(() => parseComponent(reg, { x: 1 })).toThrow(/missing type/);
  });
});
