import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@neotools/engine/platform/browser': root('../../packages/engine/src/platform/browser.ts'),
      '@neotools/engine': root('../../packages/engine/src/index.ts'),
      '@neotools/tools-pdf': root('../../packages/tools-pdf/src/index.ts'),
      '@neotools/tools-forensics': root('../../packages/tools-forensics/src/index.ts'),
      '@neotools/tools-image': root('../../packages/tools-image/src/index.ts'),
      '@neotools/tools-image-ai': root('../../packages/tools-image-ai/src/index.ts'),
      '@neotools/tools-dach': root('../../packages/tools-dach/src/index.ts'),
      '@neotools/parsers': root('../../packages/parsers/src/index.ts'),
    },
  },
});
