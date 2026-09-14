#!/usr/bin/env node
/**
 * Copy onnxruntime-web WASM (and models.json) into apps/web/public/assets/.
 * Never uses a CDN. Missing packages are skipped.
 */
import { createRequire } from 'node:module';
import { copyFile, mkdir, readdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const require = createRequire(join(pkgRoot, 'package.json'));

async function resolve(spec) {
  try {
    return require.resolve(spec);
  } catch {
    try {
      return require.resolve(spec.replace(/\/package\.json$/, ''));
    } catch {
      return null;
    }
  }
}

const destOnnx = join(repoRoot, 'apps/web/public/assets/onnx');
const destModels = join(repoRoot, 'apps/web/public/assets/models');
await mkdir(destOnnx, { recursive: true });
await mkdir(destModels, { recursive: true });

const pkgMain = await resolve('onnxruntime-web');
if (!pkgMain) {
  console.warn('skip (not installed): onnxruntime-web');
} else {
  const dist = dirname(pkgMain);
  for (const name of await readdir(dist)) {
    if (!/^ort-wasm.*\.(wasm|mjs|js)$/.test(name) && name !== 'ort.wasm.min.js') continue;
    const dest = join(destOnnx, name);
    await copyFile(join(dist, name), dest);
    console.log(`copied ${relative(repoRoot, dest)}`);
  }
}

const catalog = await readFile(join(pkgRoot, 'src/models/models.json'), 'utf8');
await writeFile(join(destModels, 'models.json'), catalog);
console.log(`copied ${relative(repoRoot, join(destModels, 'models.json'))}`);
