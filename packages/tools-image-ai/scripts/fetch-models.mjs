#!/usr/bin/env node
/**
 * Download ONNX / Transformers weights for @neotools/tools-image-ai.
 * Runtime never hits these URLs — only this script does.
 *
 *   node scripts/fetch-models.mjs --all
 *   node scripts/fetch-models.mjs --tool image-remove-background
 */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const catalog = JSON.parse(await readFile(join(pkgRoot, 'src/models/models.json'), 'utf8'));

function parseArgs(argv) {
  const out = { all: false, tool: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') out.all = true;
    else if (a === '--tool') out.tool = argv[++i] ?? null;
    else if (a === '--out') out.out = argv[++i] ?? null;
  }
  return out;
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function selectModels({ all, tool }) {
  if (all) return catalog.models;
  if (tool) return catalog.models.filter((m) => m.tools.includes(tool) || m.id === tool);
  throw new Error('Bitte --all oder --tool <id> angeben.');
}

function destDirs(custom) {
  const dirs = [
    join(pkgRoot, '.models'),
    join(homedir(), '.cache', 'neotools', 'models'),
    join(repoRoot, 'apps/web/public/assets/models'),
  ];
  if (custom) dirs.unshift(custom);
  return dirs;
}

async function download(url, dest, expectedSha, sizeBytes) {
  await mkdir(dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  console.log(`fetch ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  if (!res.body) throw new Error('Leerer Body');
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  const buf = await readFile(tmp);
  const got = sha256(buf);
  if (expectedSha && got !== expectedSha.toLowerCase()) {
    await rm(tmp, { force: true });
    throw new Error(`SHA-256 mismatch for ${dest}: expected ${expectedSha}, got ${got}`);
  }
  if (!expectedSha) {
    console.log(`  sha256 (pin this): ${got}  size=${buf.byteLength}`);
  } else if (sizeBytes && buf.byteLength !== sizeBytes) {
    console.warn(`  size ${buf.byteLength} ≠ catalog ${sizeBytes} (SHA ok)`);
  }
  await rename(tmp, dest);
  console.log(`  wrote ${dest} (${buf.byteLength} B)`);
  return got;
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const args = parseArgs(process.argv.slice(2));
const models = selectModels(args);
const dirs = destDirs(args.out);
await mkdir(dirs[0], { recursive: true });

for (const model of models) {
  if (/AGPL|NON-COMMERCIAL|CC-BY-NC/i.test(model.license)) {
    console.warn(`skip forbidden license ${model.id}: ${model.license}`);
    continue;
  }
  if (model.kind === 'transformers' && model.files?.length) {
    const base = model.url.replace(/\/onnx\/[^/]+$/, '').replace(/\/resolve\/main\/.*$/, '/resolve/main');
    for (const dir of dirs) {
      const root = join(dir, model.localName);
      for (const rel of model.files) {
        const dest = join(root, rel);
        if (await fileExists(dest)) {
          console.log(`exists ${dest}`);
          continue;
        }
        const url = `${base}/${rel}`;
        try {
          await download(url, dest, undefined, undefined);
        } catch (err) {
          console.warn(`  skip ${rel}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
    continue;
  }
  for (const dir of dirs) {
    const dest = join(dir, model.localName);
    if (await fileExists(dest)) {
      const buf = await readFile(dest);
      if (model.sha256) {
        const got = sha256(buf);
        if (got !== model.sha256) throw new Error(`Existing ${dest} has wrong SHA-256`);
      }
      console.log(`exists ${dest}`);
      continue;
    }
    await download(model.url, dest, model.sha256, model.sizeBytes);
  }
}

await writeFile(join(dirs[2] ?? dirs[0], 'models.json'), JSON.stringify(catalog, null, 2));
console.log('done');
