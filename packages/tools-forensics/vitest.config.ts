import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@neotools/engine': fileURLToPath(new URL('../engine/src/index.ts', import.meta.url)),
      '@neotools/parsers': fileURLToPath(new URL('../parsers/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
  },
});
