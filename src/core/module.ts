/**
 * module — composable, opt-in feature bundles (§6.4).
 *
 * A `Module` is the formal shape of "a function that registers everything it
 * contributes onto a world, re-run on load". Games compose the modules they
 * want; the engine core stays minimal. Modules plug in through the existing
 * extension points (registries with `override`, global reactors, components,
 * tiles, resources/statuses/effects) — `setup` is handed the assembled `World`.
 *
 * Active module ids are recorded in `WorldState.modules` (the save manifest) so
 * a load can verify every module a save was written with is present, rather
 * than silently loading a world missing the components/handlers it relies on.
 */
import type { World } from './world';

export interface Module {
  /** Unique id; recorded in the save manifest and referenced by dependencies. */
  id: string;
  /** Other module ids that must `setup` before this one. */
  dependencies?: string[];
  /** Register this module's content/behavior onto the world. */
  setup(world: World): void;
}

/**
 * Order modules so every dependency precedes its dependents — a stable
 * topological sort (input order preserved among independents). Throws on a
 * missing dependency or a cycle.
 */
export function orderModules(modules: readonly Module[]): Module[] {
  const byId = new Map<string, Module>();
  for (const m of modules) byId.set(m.id, m);

  const out: Module[] = [];
  const mark = new Map<string, 'visiting' | 'done'>();

  const visit = (m: Module, stack: readonly string[]): void => {
    const s = mark.get(m.id);
    if (s === 'done') return;
    if (s === 'visiting') throw new Error(`Module cycle: ${[...stack, m.id].join(' -> ')}`);
    mark.set(m.id, 'visiting');
    for (const dep of m.dependencies ?? []) {
      const d = byId.get(dep);
      if (!d) throw new Error(`Module "${m.id}" requires missing module "${dep}"`);
      visit(d, [...stack, m.id]);
    }
    mark.set(m.id, 'done');
    out.push(m);
  };

  for (const m of modules) visit(m, []);
  return out;
}

/**
 * Run each module's `setup` in dependency order and record the manifest on
 * `world.state.modules`. Run AFTER the core content is registered so a module
 * may `override` a built-in.
 */
export function composeModules(world: World, modules: readonly Module[]): void {
  const ordered = orderModules(modules);
  for (const m of ordered) m.setup(world);
  world.state.modules = ordered.map((m) => m.id);
}

/** Throw if any module id a save requires is absent from `provided`. */
export function assertModulesPresent(required: readonly string[], provided: readonly Module[]): void {
  const have = new Set(provided.map((m) => m.id));
  for (const id of required) {
    if (!have.has(id)) {
      throw new Error(`This save requires module "${id}", which was not provided to loadWorld`);
    }
  }
}
