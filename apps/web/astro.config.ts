import { fileURLToPath } from 'node:url';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

const engine = fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url));
const engineBrowser = fileURLToPath(
  new URL('../../packages/engine/src/platform/browser.ts', import.meta.url),
);
const toolsPdf = fileURLToPath(new URL('../../packages/tools-pdf/src/index.ts', import.meta.url));
const toolsForensics = fileURLToPath(new URL('../../packages/tools-forensics/src/index.ts', import.meta.url));
const toolsImage = fileURLToPath(new URL('../../packages/tools-image/src/index.ts', import.meta.url));
const toolsImageAi = fileURLToPath(new URL('../../packages/tools-image-ai/src/index.ts', import.meta.url));
const toolsDach = fileURLToPath(new URL('../../packages/tools-dach/src/index.ts', import.meta.url));
const toolsSpeech = fileURLToPath(new URL('../../packages/tools-speech/src/index.ts', import.meta.url));
const modelsPkg = fileURLToPath(new URL('../../packages/models/src/index.ts', import.meta.url));
const parsers = fileURLToPath(new URL('../../packages/parsers/src/index.ts', import.meta.url));
const napiStub = fileURLToPath(new URL('./src/stubs/napi-canvas.ts', import.meta.url));
const resvgStub = fileURLToPath(new URL('./src/stubs/resvg.ts', import.meta.url));
const onnxNodeStub = fileURLToPath(new URL('./src/stubs/onnxruntime-node.ts', import.meta.url));

export default defineConfig({
  site: 'https://neotools.local',
  output: 'static',
  integrations: [
    preact(),
    sitemap({
      i18n: {
        defaultLocale: 'de',
        locales: { de: 'de-DE', en: 'en' },
      },
      filter(page) {
        // Hidden tools are not generated; planned convert pages stay in the sitemap but send noindex.
        return !page.includes('/offline');
      },
    }),
  ],
  i18n: {
    defaultLocale: 'de',
    locales: ['de', 'en'],
    routing: { prefixDefaultLocale: false },
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@neotools/engine/platform/browser': engineBrowser,
        '@neotools/engine': engine,
        '@neotools/tools-pdf': toolsPdf,
        '@neotools/tools-forensics': toolsForensics,
        '@neotools/tools-image': toolsImage,
        '@neotools/tools-image-ai': toolsImageAi,
        '@neotools/tools-dach': toolsDach,
        '@neotools/tools-speech': toolsSpeech,
        '@neotools/models': modelsPkg,
        '@neotools/parsers': parsers,
        '@napi-rs/canvas': napiStub,
        '@resvg/resvg-js': resvgStub,
        'onnxruntime-node': onnxNodeStub,
      },
    },
    worker: { format: 'es' },
    assetsInclude: ['**/*.wasm'],
    build: {
      reportCompressedSize: false,
      sourcemap: false,
      rollupOptions: { maxParallelFileOps: 2 },
    },
    optimizeDeps: {
      exclude: [
        '@napi-rs/canvas',
        '@resvg/resvg-js',
        'onnxruntime-node',
        '@jspawn/qpdf-wasm',
        '@jsquash/jpeg',
        '@jsquash/png',
        '@jsquash/webp',
        '@jsquash/avif',
        '@jsquash/jxl',
        '@jsquash/oxipng',
        'tesseract.js',
      ],
    },
    ssr: {
      noExternal: [
        '@neotools/engine',
        '@neotools/tools-pdf',
        '@neotools/tools-forensics',
        '@neotools/tools-image',
        '@neotools/tools-image-ai',
        '@neotools/tools-dach',
        '@neotools/tools-speech',
        '@neotools/models',
        '@neotools/parsers',
        'pdfjs-dist',
        'pdf-lib',
        '@cantoo/pdf-lib',
        '@jspawn/qpdf-wasm',
        '@jsquash/jpeg',
        '@jsquash/png',
        'tesseract.js',
        'fflate',
      ],
    },
  },
});
