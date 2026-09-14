#!/usr/bin/env node
/**
 * Copy OFL latin subsets (Source Sans 3 / Source Serif 4 / Source Code Pro)
 * into packages/tools-office/assets/fonts and apps/web/public/assets/fonts.
 * Files are typically well under 2 MB total. Larger binaries stay gitignored.
 */
import { createRequire } from 'node:module';
import { copyFile, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const office = fileURLToPath(new URL('..', import.meta.url));
const destOffice = join(office, 'assets/fonts');
const destWeb = join(root, 'apps/web/public/assets/fonts');
const require = createRequire(join(office, 'package.json'));

const families = [
  ['@fontsource/source-sans-3', 'source-sans-3-latin'],
  ['@fontsource/source-serif-4', 'source-serif-4-latin'],
  ['@fontsource/source-code-pro', 'source-code-pro-latin'],
];
const styles = ['400-normal', '700-normal', '400-italic', '700-italic'];

await mkdir(destOffice, { recursive: true });
await mkdir(destWeb, { recursive: true });

let total = 0;
for (const [pkg, prefix] of families) {
  let filesDir;
  try {
    filesDir = join(dirname(require.resolve(`${pkg}/package.json`)), 'files');
  } catch {
    console.warn(`skip (not installed): ${pkg}`);
    continue;
  }
  for (const style of styles) {
    for (const ext of ['woff', 'woff2']) {
      const name = `${prefix}-${style}.${ext}`;
      const src = join(filesDir, name);
      try {
        const st = await stat(src);
        total += st.size;
        await copyFile(src, join(destOffice, name));
        await copyFile(src, join(destWeb, name));
        console.log(`copied ${name} (${st.size} bytes)`);
      } catch {
        // style/ext may not exist
      }
    }
  }
}

const imageFont = join(root, 'packages/tools-image/assets/fonts/SourceSans3-Regular.otf');
try {
  const st = await stat(imageFont);
  total += st.size;
  await copyFile(imageFont, join(destOffice, 'SourceSans3-Regular.otf'));
  await copyFile(imageFont, join(destWeb, 'SourceSans3-Regular.otf'));
  console.log('copied SourceSans3-Regular.otf from tools-image');
} catch {
  console.warn('skip tools-image Source Sans 3 (missing)');
}

console.log(`office fonts total ${total} bytes (${(total / 1024 / 1024).toFixed(2)} MiB)`);
if (total > 2 * 1024 * 1024) {
  console.warn('over 2 MiB — keep binaries gitignored, use this script after install');
}

const oflSrc = join(root, 'packages/tools-image/assets/fonts/OFL.txt');
try {
  const ofl = await readFile(oflSrc, 'utf8');
  const banner = `Source Sans 3, Source Serif 4 and Source Code Pro
Copyright 2010-2024 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'.

`;
  await writeFile(join(destOffice, 'OFL.txt'), banner + ofl);
} catch {
  await writeFile(
    join(destOffice, 'OFL.txt'),
    "These fonts are licensed under the SIL Open Font License, Version 1.1.\nSee https://scripts.sil.org/OFL\nReserved Font Name: Source (Adobe).\n",
  );
}

void relative;
