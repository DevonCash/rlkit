import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// Run the game directly against rlkit's live source (HMR, no build step). The
// same `rlkit` alias is used by the dev server and the vitest game suite below.
const rlkit = fileURLToPath(new URL('../../src/index.ts', import.meta.url));

export default defineConfig({
  resolve: { alias: { rlkit } },
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
