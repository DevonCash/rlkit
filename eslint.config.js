// @ts-check
import tseslint from 'typescript-eslint';

/**
 * Import-boundary enforcement for the §17 layering:
 *   core ← sim/mapgen ← render/input/ui    (deps point downward only)
 *   adapters are injected leaves
 *   rotJS is allowed ONLY inside adapters/
 *   core/sim/mapgen import neither rotJS nor the DOM
 *     (DOM exclusion is also enforced structurally by tsconfig `lib`)
 *
 * Patterns match the import source string, so they catch rotJS by package
 * name and upward layers by path at any relative depth.
 */
const ROTJS = ['rot-js', 'rot-js/*', '**/rot-js', '**/rot-js/*'];
const layer = (name) => [`**/${name}/**`, `**/${name}`];

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  ...tseslint.configs.recommended,
  {
    // Headless layers must never touch the DOM. `tsconfig.lib` already makes
    // DOM globals a type error; this is defense-in-depth at lint time.
    files: ['src/core/**/*.ts', 'src/sim/**/*.ts', 'src/mapgen/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'No DOM in headless core/sim/mapgen.' },
        { name: 'window', message: 'No DOM in headless core/sim/mapgen.' },
        { name: 'navigator', message: 'No DOM in headless core/sim/mapgen.' },
      ],
    },
  },
  {
    // core: bottom layer — may not reach rotJS or any layer above it.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...ROTJS,
            ...layer('sim'),
            ...layer('mapgen'),
            ...layer('render'),
            ...layer('input'),
            ...layer('ui'),
            ...layer('adapters'),
          ],
        },
      ],
    },
  },
  {
    // sim + mapgen: rules layer — may import core, but not rotJS,
    // the presentation layers, or adapters (injected, never imported).
    files: ['src/sim/**/*.ts', 'src/mapgen/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...ROTJS,
            ...layer('render'),
            ...layer('input'),
            ...layer('ui'),
            ...layer('adapters'),
          ],
        },
      ],
    },
  },
  {
    // presentation: may observe lower layers, but rotJS stays in adapters.
    files: ['src/render/**/*.ts', 'src/input/**/*.ts', 'src/ui/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...ROTJS] }],
    },
  },
);
