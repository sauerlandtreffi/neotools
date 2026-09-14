#!/usr/bin/env node
/**
 * Download a published LGPL ffmpeg-core from a GitHub Release produced by
 * .github/workflows/ffmpeg-lgpl.yml (Dockerfile.ffmpeg-lgpl).
 * Env: NEOTOOLS_FFMPEG_LGPL_URL or NEOTOOLS_FFMPEG_LGPL_REPO (owner/name) + tag.
 * Never uses a CDN; only GitHub Releases of this project.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const destDir = join(root, 'packages/tools-media/vendor/ffmpeg-lgpl');
const repo = process.env.NEOTOOLS_FFMPEG_LGPL_REPO || 'neotools/neotools';
const tag = process.env.NEOTOOLS_FFMPEG_LGPL_TAG || 'ffmpeg-lgpl';
const base =
  process.env.NEOTOOLS_FFMPEG_LGPL_URL ||
  `https://github.com/${repo}/releases/download/${tag}`;

const REQUIRED = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];
const OPTIONAL = ['BUILD-INFO.json', 'LICENSE.txt'];

async function grab(name, required) {
  const url = `${base.replace(/\/$/, '')}/${name}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (!required) {
      console.warn(`skip optional ${name}: ${url} → ${res.status}`);
      return;
    }
    throw new Error(`${url} → ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(destDir, { recursive: true });
  await writeFile(join(destDir, name), buf);
  console.log(`fetched ${name} (${buf.byteLength} bytes)`);
}

try {
  for (const name of REQUIRED) await grab(name, true);
  for (const name of OPTIONAL) await grab(name, false);
} catch (err) {
  console.warn(`skip LGPL core fetch: ${err instanceof Error ? err.message : err}`);
  console.warn(`Build locally: packages/tools-media/scripts/build-ffmpeg-lgpl.sh`);
  console.warn(`Image: packages/tools-media/Dockerfile.ffmpeg-lgpl (ffmpeg.wasm v0.12.10, no --enable-gpl)`);
  process.exitCode = process.env.NEOTOOLS_FFMPEG_LGPL_REQUIRED ? 1 : 0;
}

void dirname;
