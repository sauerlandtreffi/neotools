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
const require = createRequire(join(root, 'packages/tools-pdf/package.json'));

async function resolve(spec) {
  try {
    return require.resolve(spec);
  } catch {
    return null;
  }
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
await copyResolved('tesseract.js/dist/worker.min.js', 'apps/web/public/assets/tesseract/worker.min.js');
const tessCoreFromTess = (() => {
  try {
    const tessPkg = require.resolve('tesseract.js/package.json');
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
