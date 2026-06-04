import { describe, it, expect } from 'vitest';
import { createWorld, loadWorld, encodeSave } from '../../src/index';
import type { Module } from '../../src/index';
import { defaultConfig } from '../../src/config/defaults';

describe('modules (§6.4)', () => {
  it('composes modules in dependency order and records the manifest', () => {
    const log: string[] = [];
    const m = (id: string, deps?: string[]): Module => ({
      id,
      ...(deps ? { dependencies: deps } : {}),
      setup: () => log.push(id),
    });
    const w = createWorld({ config: defaultConfig, rng: 1, modules: [m('c', ['b']), m('b', ['a']), m('a')] });
    expect(log).toEqual(['a', 'b', 'c']); // dependencies first, despite input order
    expect(w.state.modules).toEqual(['a', 'b', 'c']);
  });

  it('a module registers content that resolves through the world', () => {
    const mod: Module = {
      id: 'greeter',
      setup: (world) => world.services.registries.handlers!.register('greet', () => {}),
    };
    const w = createWorld({ config: defaultConfig, rng: 1, modules: [mod] });
    expect(w.services.registries.handlers!.has('greet')).toBe(true);
  });

  it('throws on a missing dependency and on a cycle', () => {
    const m = (id: string, deps: string[]): Module => ({ id, dependencies: deps, setup: () => {} });
    expect(() => createWorld({ config: defaultConfig, rng: 1, modules: [m('x', ['nope'])] })).toThrow(/missing module/);
    expect(() =>
      createWorld({ config: defaultConfig, rng: 1, modules: [m('x', ['y']), m('y', ['x'])] }),
    ).toThrow(/cycle/i);
  });

  it('round-trips the manifest and rejects a load missing a required module', () => {
    const tag: Module = { id: 'tag', setup: () => {} };
    const blob = encodeSave(createWorld({ config: defaultConfig, rng: 1, modules: [tag] }));

    const reloaded = loadWorld(blob, { config: defaultConfig, modules: [tag] });
    expect(reloaded.state.modules).toEqual(['tag']);

    expect(() => loadWorld(blob, { config: defaultConfig, modules: [] })).toThrow(/requires module "tag"/);
  });
});
