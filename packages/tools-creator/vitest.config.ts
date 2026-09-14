import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@neotools/engine': fileURLToPath(new URL('../engine/src/index.ts', import.meta.url)),
      '@neotools/parsers': fileURLToPath(new URL('../parsers/src/index.ts', import.meta.url)),
      '@neotools/tools-image': fileURLToPath(new URL('../tools-image/src/index.ts', import.meta.url)),
      '@neotools/tools-media': fileURLToPath(new URL('../tools-media/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 180000,
  },
});
