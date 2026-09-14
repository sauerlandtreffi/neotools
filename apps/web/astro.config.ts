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
const napiStub = fileURLToPath(new URL('./src/stubs/napi-canvas.ts', import.meta.url));

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
        '@napi-rs/canvas': napiStub,
      },
    },
    worker: { format: 'es' },
    assetsInclude: ['**/*.wasm'],
    optimizeDeps: {
      exclude: ['@napi-rs/canvas', '@jspawn/qpdf-wasm', '@jsquash/jpeg', '@jsquash/png', 'tesseract.js'],
    },
    ssr: {
      noExternal: [
        '@neotools/engine',
        '@neotools/tools-pdf',
        '@neotools/tools-forensics',
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
