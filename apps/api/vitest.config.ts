import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@neotools/engine/platform/node': fileURLToPath(
        new URL('../../packages/engine/src/platform/node.ts', import.meta.url),
      ),
      '@neotools/engine': fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url)),
      '@neotools/license': fileURLToPath(new URL('../../packages/license/src/index.ts', import.meta.url)),
      '@neotools/tools-pdf': fileURLToPath(new URL('../../packages/tools-pdf/src/index.ts', import.meta.url)),
      '@neotools/tools-forensics': fileURLToPath(
        new URL('../../packages/tools-forensics/src/index.ts', import.meta.url),
      ),
      '@neotools/tools-image': fileURLToPath(new URL('../../packages/tools-image/src/index.ts', import.meta.url)),
      '@neotools/tools-image-ai': fileURLToPath(
        new URL('../../packages/tools-image-ai/src/index.ts', import.meta.url),
      ),
      '@neotools/tools-dach': fileURLToPath(new URL('../../packages/tools-dach/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 60000,
  },
});
