import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@neotools/engine/platform/node': fileURLToPath(
        new URL('../../packages/engine/src/platform/node.ts', import.meta.url),
      ),
      '@neotools/engine': fileURLToPath(
        new URL('../../packages/engine/src/index.ts', import.meta.url),
      ),
      '@neotools/tools-pdf': fileURLToPath(
        new URL('../../packages/tools-pdf/src/index.ts', import.meta.url),
      ),
      '@neotools/tools-forensics': fileURLToPath(
        new URL('../../packages/tools-forensics/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 90000,
  },
});
