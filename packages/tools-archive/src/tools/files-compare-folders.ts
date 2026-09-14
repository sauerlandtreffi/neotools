import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes, sha256 } from '@neotools/engine';
import { ARCHIVE_CATEGORY, ARCHIVE_LICENSES } from '../licenses.js';
import { readAny } from '../zip-tar.js';
import { gatherFiles } from '../walk.js';

const options = z.object({
  leftRoot: z.string().default(''),
  rightRoot: z.string().default(''),
});

async function mapOf(files: Parameters<typeof gatherFiles>[0], root: string, zipHint: boolean): Promise<Map<string, string>> {
  const list = await gatherFiles(files, root);
  if (zipHint && list.length === 1) {
    const inner = await readAny(await list[0]!.bytes(), list[0]!.name);
    const m = new Map<string, string>();
    for (const [n, b] of Object.entries(inner.files)) m.set(n, await sha256(b));
    return m;
  }
  const m = new Map<string, string>();
  for (const f of list) m.set(f.name.replace(/\\/g, '/'), await sha256(await f.bytes()));
  return m;
}

export const filesCompareFolders = defineTool({
  id: 'files-compare-folders',
  pack: 'archive',
  category: ARCHIVE_CATEGORY,
  title: { de: 'Ordner vergleichen', en: 'Compare folders' },
  description: {
    de: 'Zwei ZIPs oder Dateimengen: nur links / nur rechts / anders (SHA-256).',
    en: 'Two ZIPs or file sets: left-only / right-only / different (SHA-256).',
  },
  inputs: { accept: ['*/*'], multiple: true, min: 2, directory: true },
  outputs: { mime: [MIME.json, MIME.md] },
  options,
  licenses: ARCHIVE_LICENSES,
  seo: { keywords: ['ordner vergleich', 'folder diff'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const zips = files.filter((f) => /\.zip$/i.test(f.name));
    ctx.progress(0.3, 'hash');
    let left: Map<string, string>;
    let right: Map<string, string>;
    if (zips.length >= 2) {
      left = await mapOf([zips[0]!], '', true);
      right = await mapOf([zips[1]!], '', true);
    } else {
      const mid = Math.ceil(files.length / 2);
      left = await mapOf(files.slice(0, mid), parsed.leftRoot, false);
      right = await mapOf(files.slice(mid), parsed.rightRoot, false);
    }
    const onlyLeft = [...left.keys()].filter((k) => !right.has(k));
    const onlyRight = [...right.keys()].filter((k) => !left.has(k));
    const different = [...left.keys()].filter((k) => right.has(k) && right.get(k) !== left.get(k));
    const payload = { onlyLeft, onlyRight, different };
    const md = ['# Vergleich', '', `nur links: ${onlyLeft.length}`, `nur rechts: ${onlyRight.length}`, `anders: ${different.length}`].join('\n');
    return {
      outputs: [
        neoFileFromBytes('folder-diff.json', new TextEncoder().encode(JSON.stringify(payload, null, 2)), MIME.json),
        neoFileFromBytes('folder-diff.md', new TextEncoder().encode(md + '\n'), MIME.md),
      ],
      warnings: [],
      report: attachProvenance(payload, await createProvenance('files-compare-folders', parsed, files)),
    };
  },
});
