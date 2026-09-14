#!/usr/bin/env node
/**
 * Downloads official e-invoice XSD / Schematron into assets/schemas/ (gitignored).
 * Offline-safe: exits 0 if a fetch fails.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'assets/schemas');
const web = join(root, '../../apps/web/public/assets/einvoice-schemas');

const FILES = [
  {
    url: 'https://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/maindoc/UBL-Invoice-2.1.xsd',
    path: 'ubl/UBL-Invoice-2.1.xsd',
    note: 'OASIS UBL 2.1 Invoice — typically freely redistributable',
  },
  {
    url: 'https://raw.githubusercontent.com/itplr-kosit/xrechnung-schematron/master/src/validation/schematron/ubl/XRechnung-UBL-validation.sch',
    path: 'kosit/XRechnung-UBL-validation.sch',
    note: 'KoSIT XRechnung Schematron (Apache-2.0)',
  },
];

const optional = process.argv.includes('--optional');

await mkdir(dest, { recursive: true });
await mkdir(web, { recursive: true });
await writeFile(join(dest, 'NOTICE.txt'), `Fetched ${new Date().toISOString()}\nSee README.md for licences.\n`);

for (const file of FILES) {
  try {
    const res = await fetch(file.url, { headers: { Accept: 'application/xml,text/plain,*/*' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const target = join(dest, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buf);
    const copy = join(web, file.path);
    await mkdir(dirname(copy), { recursive: true });
    await writeFile(copy, buf);
    console.log('ok', file.path, file.note);
  } catch (err) {
    console.warn('skip', file.path, err instanceof Error ? err.message : err);
    if (!optional) {
      // still 0 — CI / offline must not fail the install
    }
  }
}
