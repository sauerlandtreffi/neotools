#!/usr/bin/env node
/**
 * Fail if de/en UI dict keys or categoryLabels diverge.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'apps/web/src/lib/i18n.ts'), 'utf8');

function extractBlock(label) {
  const start = src.indexOf(`${label}: {`);
  if (start < 0) throw new Error(`block ${label} missing`);
  let i = src.indexOf('{', start);
  let depth = 0;
  const begin = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(begin, i + 1);
    }
  }
  throw new Error(`unclosed ${label}`);
}

function keysOf(block) {
  const keys = new Set();
  const re = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*:/gm;
  let m;
  while ((m = re.exec(block))) keys.add(m[1]);
  return keys;
}

const dictDe = keysOf(extractBlock('de'));
const dictEn = keysOf(extractBlock('en'));
const catStart = src.indexOf('export const categoryLabels');
const cat = src.slice(catStart);
const catDe = keysOf(cat.slice(cat.indexOf('de: {') + 4, cat.indexOf('en: {')));
const catEn = keysOf(cat.slice(cat.indexOf('en: {') + 4));

function diff(a, b) {
  return [...a].filter((k) => !b.has(k)).sort();
}

const missingEn = diff(dictDe, dictEn);
const missingDe = diff(dictEn, dictDe);
const catMissingEn = diff(catDe, catEn);
const catMissingDe = diff(catEn, catDe);

if (missingEn.length || missingDe.length || catMissingEn.length || catMissingDe.length) {
  console.error('i18n key mismatch');
  if (missingEn.length) console.error('dict missing in en:', missingEn.join(', '));
  if (missingDe.length) console.error('dict missing in de:', missingDe.join(', '));
  if (catMissingEn.length) console.error('category missing in en:', catMissingEn.join(', '));
  if (catMissingDe.length) console.error('category missing in de:', catMissingDe.join(', '));
  process.exit(1);
}

console.log(`i18n ok: ${dictDe.size} dict keys, ${catDe.size} categories (de=en)`);
