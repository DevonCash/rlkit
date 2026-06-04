import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Core/sim/mapgen are pure and run headless in node.
    // Presentation tests (§22.14) can opt into jsdom per-file later.
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.ts'],
    // Property tests (fast-check) generate many full maps/worlds per case; under
    // the full concurrent suite the default 5s is too tight. 20s is generous
    // headroom without masking a genuine hang.
    testTimeout: 20_000,
  },
});
