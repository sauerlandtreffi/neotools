#!/usr/bin/env node
/**
 * Download tessdata_fast traineddata (eng + deu), gzip them, write to
 * apps/web/public/tessdata/*.traineddata.gz
 *
 * Files are gitignored when large; this script is the source of truth.
 * Use --optional so offline / CI without network does not fail (postinstall).
 */
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const optional = process.argv.includes('--optional');
const root = fileURLToPath(new URL('..', import.meta.url));
const destDir = join(root, 'apps/web/public/tessdata');
const LANGS = ['eng', 'deu'];
const BASE = 'https://github.com/tesseract-ocr/tessdata_fast/raw/main';

async function fetchLang(lang) {
  const url = `${BASE}/${lang}.traineddata`;
  const dest = join(destDir, `${lang}.traineddata.gz`);
  try {
    const existing = await stat(dest);
    if (existing.size > 1000) {
      console.log(`keep ${relative(root, dest)} (${existing.size} bytes)`);
      return;
    }
  } catch {
    // download
  }
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`tessdata ${lang}: HTTP ${res.status} ${url}`);
  }
  await pipeline(Readable.fromWeb(res.body), createGzip({ level: 9 }), createWriteStream(dest));
  const info = await stat(dest);
  console.log(`wrote ${relative(root, dest)} (${info.size} bytes)`);
}

await mkdir(destDir, { recursive: true });
try {
  for (const lang of LANGS) await fetchLang(lang);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (optional) {
    console.warn(`fetch-tessdata optional: ${msg}`);
    process.exit(0);
  }
  console.error(msg);
  process.exit(1);
}
