import { describe, it, expect } from 'vitest';
import { createRegistry } from '../../src/core/registry';

describe('registry', () => {
  it('returns registered defs', () => {
    const reg = createRegistry<{ n: number }>('thing');
    reg.register('a', { n: 1 });
    reg.register('b', { n: 2 });
    expect(reg.get('a')).toEqual({ n: 1 });
    expect(reg.get('b')).toEqual({ n: 2 });
    expect(reg.has('a')).toBe(true);
    expect(reg.tryGet('missing')).toBeUndefined();
  });

  it('throws a clear error on an unknown id', () => {
    const reg = createRegistry<number>('effect');
    expect(() => reg.get('nope')).toThrow(/Registry\(effect\): unknown id "nope"/);
  });

  it('rejects duplicate registration', () => {
    const reg = createRegistry<number>('tile');
    reg.register('floor', 1);
    expect(() => reg.register('floor', 2)).toThrow(/already registered/);
  });

  it('lists ids in insertion order', () => {
    const reg = createRegistry<number>();
    reg.register('z', 1);
    reg.register('a', 2);
    reg.register('m', 3);
    expect(reg.ids()).toEqual(['z', 'a', 'm']);
  });
});
