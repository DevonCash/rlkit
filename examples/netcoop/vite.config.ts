import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const rlkit = fileURLToPath(new URL('../../src/index.ts', import.meta.url));

export default defineConfig({
  resolve: { alias: { rlkit } },
  server: { port: 5175, strictPort: true },
});
