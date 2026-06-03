import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Core/sim/mapgen are pure and run headless in node.
    // Presentation tests (§22.14) can opt into jsdom per-file later.
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.ts'],
  },
});
