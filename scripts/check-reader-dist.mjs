import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'apps/web/dist');
const reader = join(dist, 'reader/index.html');
const readerEn = join(dist, 'en/reader/index.html');

if (!existsSync(reader)) throw new Error('missing apps/web/dist/reader/index.html');
if (!existsSync(readerEn)) throw new Error('missing apps/web/dist/en/reader/index.html');

const html = readFileSync(reader, 'utf8');
if (!html.includes('Reader') && !html.includes('reader')) {
  throw new Error('reader page has no reader marker');
}

const astro = join(dist, '_astro');
if (!existsSync(astro)) throw new Error('missing apps/web/dist/_astro');
const bundled = readdirSync(astro).some((name) => /Reader|reader/i.test(name));
if (!bundled && !html.includes('/_astro/')) {
  throw new Error('reader island does not appear bundled');
}

console.log('reader dist ok', reader, readerEn);
