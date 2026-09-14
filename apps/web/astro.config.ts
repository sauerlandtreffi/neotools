import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
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
const audioDecoderStub = fileURLToPath(new URL('./src/stubs/audio-decoders.ts', import.meta.url));
const webLlmStub = fileURLToPath(new URL('./src/stubs/web-llm.ts', import.meta.url));
const toolsOffice = fileURLToPath(new URL('../../packages/tools-office/src/index.ts', import.meta.url));
const toolsMedia = fileURLToPath(new URL('../../packages/tools-media/src/index.ts', import.meta.url));
const toolsArchive = fileURLToPath(new URL('../../packages/tools-archive/src/index.ts', import.meta.url));
const licensePkg = fileURLToPath(new URL('../../packages/license/src/index.ts', import.meta.url));
const ffmpegBrowser = join(
  dirname(createRequire(fileURLToPath(new URL('../../packages/tools-media/package.json', import.meta.url))).resolve('@ffmpeg/ffmpeg')),
  'index.js',
);
const stub = (name: string) => fileURLToPath(new URL(`./src/stubs/${name}`, import.meta.url));
const nodeAliases = {
  'node:fs/promises': stub('node-fs-promises.ts'),
  'node:fs': stub('node-fs.ts'),
  'node:module': stub('node-module.ts'),
  'node:path': stub('node-path.ts'),
  'node:url': stub('node-url.ts'),
  'node:crypto': stub('node-crypto.ts'),
  'node:child_process': stub('node-child-process.ts'),
  'node:os': stub('node-os.ts'),
  'node:util': stub('node-util.ts'),
  fs: stub('node-fs.ts'),
  path: stub('node-path.ts'),
  crypto: stub('node-crypto.ts'),
  module: stub('node-module.ts'),
  url: stub('node-url.ts'),
  os: stub('node-os.ts'),
  util: stub('node-util.ts'),
  child_process: stub('node-child-process.ts'),
  buffer: stub('buffer.ts'),
} as const;

const srcPackageAliases = {
  '@neotools/engine/platform/browser': engineBrowser,
  '@neotools/engine': engine,
  '@neotools/tools-pdf': toolsPdf,
  '@neotools/tools-forensics': toolsForensics,
  '@neotools/tools-image': toolsImage,
  '@neotools/tools-image-ai': toolsImageAi,
  '@neotools/tools-dach': toolsDach,
  '@neotools/tools-speech': toolsSpeech,
  '@neotools/tools-office': toolsOffice,
  '@neotools/tools-media': toolsMedia,
  '@neotools/tools-archive': toolsArchive,
  '@neotools/license': licensePkg,
  '@neotools/models': modelsPkg,
  '@neotools/parsers': parsers,
} as const;

const browserStubs = {
  '@ffmpeg/ffmpeg': ffmpegBrowser,
  '@napi-rs/canvas': napiStub,
  '@resvg/resvg-js': resvgStub,
  'onnxruntime-node': onnxNodeStub,
  'mpg123-decoder': audioDecoderStub,
  '@wasm-audio-decoders/mpg123': audioDecoderStub,
  '@wasm-audio-decoders/flac': audioDecoderStub,
  'ogg-opus-decoder': audioDecoderStub,
  '@mlc-ai/web-llm': webLlmStub,
} as const;

const heavySsrExternal = [
  '@ffmpeg/ffmpeg',
  '@ffmpeg/util',
  '@ffmpeg/core',
  '@huggingface/transformers',
  'onnxruntime-web',
  'onnxruntime-common',
  'tesseract.js',
  'mp4box',
  'mp4-muxer',
  '@xenova/transformers',
];

const workerStubPlugin = {
  name: 'neotools-worker-stubs',
  enforce: 'pre' as const,
  resolveId(id: string) {
    if (id in browserStubs) return browserStubs[id as keyof typeof browserStubs];
    if (id in nodeAliases) return nodeAliases[id as keyof typeof nodeAliases];
    return undefined;
  },
};

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
        ...srcPackageAliases,
        ...browserStubs,
      },
    },
    worker: {
      format: 'es',
      plugins: () => [workerStubPlugin],
    },
    assetsInclude: ['**/*.wasm'],
    build: {
      reportCompressedSize: false,
      sourcemap: false,
      rollupOptions: { maxParallelFileOps: 1 },
    },
    optimizeDeps: {
      exclude: [
        '@napi-rs/canvas',
        '@resvg/resvg-js',
        'onnxruntime-node',
        'mpg123-decoder',
        '@wasm-audio-decoders/mpg123',
        '@wasm-audio-decoders/flac',
        'ogg-opus-decoder',
        '@mlc-ai/web-llm',
        '@jspawn/qpdf-wasm',
        '@jsquash/jpeg',
        '@jsquash/png',
        '@jsquash/webp',
        '@jsquash/avif',
        '@jsquash/jxl',
        '@jsquash/oxipng',
        'tesseract.js',
        '@ffmpeg/ffmpeg',
        '@ffmpeg/core',
        '@huggingface/transformers',
        'onnxruntime-web',
      ],
    },
    ssr: {
      external: heavySsrExternal,
      noExternal: [
        '@neotools/engine',
        '@neotools/tools-pdf',
        '@neotools/tools-forensics',
        '@neotools/tools-image',
        '@neotools/tools-image-ai',
        '@neotools/tools-dach',
        '@neotools/tools-speech',
        '@neotools/tools-office',
        '@neotools/tools-media',
        '@neotools/tools-archive',
        '@neotools/license',
        '@neotools/models',
        '@neotools/parsers',
        'pdfjs-dist',
        'pdf-lib',
        '@cantoo/pdf-lib',
        '@jspawn/qpdf-wasm',
        '@jsquash/jpeg',
        '@jsquash/png',
        'fflate',
      ],
    },
  },
});
