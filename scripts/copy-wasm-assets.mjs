#!/usr/bin/env node
/**
 * Copy self-hosted WASM/worker assets into apps/web/public/assets/.
 * Never uses a CDN. Safe to re-run. Missing packages are skipped with a warning.
 */
import { createRequire } from 'node:module';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const requirePdf = createRequire(join(root, 'packages/tools-pdf/package.json'));
const requireImage = createRequire(join(root, 'packages/tools-image/package.json'));

async function resolve(spec) {
  for (const req of [requireImage, requirePdf]) {
    try {
      return req.resolve(spec);
    } catch {
      // try next workspace package
    }
  }
  return null;
}

async function copy(src, dest) {
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  console.log(`copied ${relative(root, dest)}`);
}

async function copyResolved(spec, destRel) {
  const src = await resolve(spec);
  if (!src) {
    console.warn(`skip (not installed): ${spec}`);
    return;
  }
  await copy(src, join(root, destRel));
}

async function copyDirFiles(pkgFile, destRel, filter) {
  const pkg = pkgFile.startsWith('/') ? pkgFile : await resolve(pkgFile);
  if (!pkg) {
    console.warn(`skip (not installed): ${pkgFile}`);
    return;
  }
  const dir = dirname(pkg);
  const destDir = join(root, destRel);
  await mkdir(destDir, { recursive: true });
  for (const name of await readdir(dir)) {
    if (filter && !filter(name)) continue;
    await copy(join(dir, name), join(destDir, name));
  }
}

await mkdir(join(root, 'apps/web/public/assets/qpdf'), { recursive: true });
await mkdir(join(root, 'apps/web/public/assets/jsquash'), { recursive: true });
await mkdir(join(root, 'apps/web/public/assets/tesseract'), { recursive: true });

await copyResolved('@jspawn/qpdf-wasm/qpdf.wasm', 'apps/web/public/assets/qpdf/qpdf.wasm');
await copyResolved('@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm', 'apps/web/public/assets/jsquash/mozjpeg_enc.wasm');
await copyResolved('@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm', 'apps/web/public/assets/jsquash/mozjpeg_dec.wasm');
await copyResolved('@jsquash/png/codec/pkg/squoosh_png_bg.wasm', 'apps/web/public/assets/jsquash/squoosh_png_bg.wasm');
await copyResolved('@jsquash/webp/codec/enc/webp_enc.wasm', 'apps/web/public/assets/jsquash/webp_enc.wasm');
await copyResolved('@jsquash/webp/codec/dec/webp_dec.wasm', 'apps/web/public/assets/jsquash/webp_dec.wasm');
await copyResolved('@jsquash/avif/codec/enc/avif_enc.wasm', 'apps/web/public/assets/jsquash/avif_enc.wasm');
await copyResolved('@jsquash/avif/codec/dec/avif_dec.wasm', 'apps/web/public/assets/jsquash/avif_dec.wasm');
await copyResolved('@jsquash/jxl/codec/enc/jxl_enc.wasm', 'apps/web/public/assets/jsquash/jxl_enc.wasm');
await copyResolved('@jsquash/jxl/codec/dec/jxl_dec.wasm', 'apps/web/public/assets/jsquash/jxl_dec.wasm');
await copyResolved('@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm', 'apps/web/public/assets/jsquash/squoosh_oxipng_bg.wasm');
await copyResolved('tesseract.js/dist/worker.min.js', 'apps/web/public/assets/tesseract/worker.min.js');
const tessCoreFromTess = (() => {
  try {
    const tessPkg = requirePdf.resolve('tesseract.js/package.json');
    return createRequire(tessPkg).resolve('tesseract.js-core/package.json');
  } catch {
    return null;
  }
})();
if (tessCoreFromTess) {
  await copyDirFiles(tessCoreFromTess, 'apps/web/public/assets/tesseract', (name) =>
    /^(tesseract-core.*\.(js|wasm)|index\.js)$/.test(name),
  );
} else {
  await copyDirFiles('tesseract.js-core/package.json', 'apps/web/public/assets/tesseract', (name) =>
    /^(tesseract-core.*\.(js|wasm)|index\.js)$/.test(name),
  );
}

try {
  await import(new URL('../packages/tools-image-ai/scripts/copy-onnx-assets.mjs', import.meta.url).href);
} catch (err) {
  console.warn(`skip onnx assets: ${err instanceof Error ? err.message : err}`);
}


try {
  const { readFile, writeFile, mkdir } = await import('node:fs/promises');
  const dest = join(root, 'apps/web/public/assets/models');
  await mkdir(dest, { recursive: true });
  const catalogs = [];
  for (const rel of [
    'packages/tools-image-ai/src/models/models.json',
    'packages/tools-speech/src/models/models.json',
  ]) {
    try {
      catalogs.push(JSON.parse(await readFile(join(root, rel), 'utf8')));
    } catch {
      // pack not present
    }
  }
  const merged = { version: 1, models: [] };
  const seen = new Set();
  for (const cat of catalogs) {
    for (const m of cat.models ?? []) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      merged.models.push(m);
    }
  }
  if (merged.models.length) {
    await writeFile(join(dest, 'models.json'), JSON.stringify(merged, null, 2));
    console.log('merged models.json catalogs');
  }
} catch (err) {
  console.warn(`skip speech model catalog merge: ${err instanceof Error ? err.message : err}`);
}

const fontSrc = join(root, 'packages/tools-image/assets/fonts/SourceSans3-Regular.otf');
try {
  await copy(fontSrc, join(root, 'apps/web/public/assets/fonts/SourceSans3-Regular.otf'));
} catch {
  console.warn('skip font: packages/tools-image/assets/fonts/SourceSans3-Regular.otf missing');
}
