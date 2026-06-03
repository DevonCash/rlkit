import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// Run the demo directly against rlkit's live source (HMR, no build step, no
// workspace). The engine library never pulls DOM into its own tsconfig.
export default defineConfig({
  resolve: {
    alias: {
      rlkit: fileURLToPath(new URL('../../src/index.ts', import.meta.url)),
    },
  },
});
