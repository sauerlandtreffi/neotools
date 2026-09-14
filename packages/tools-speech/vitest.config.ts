import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@neotools/engine': fileURLToPath(new URL('../engine/src/index.ts', import.meta.url)),
      '@neotools/models': fileURLToPath(new URL('../models/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 60000,
  },
});
