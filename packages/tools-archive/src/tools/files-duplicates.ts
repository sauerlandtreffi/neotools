import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes, sha256 } from '@neotools/engine';
import { ARCHIVE_CATEGORY, ARCHIVE_LICENSES } from '../licenses.js';
import { gatherFiles } from '../walk.js';

const options = z.object({
  rootPath: z.string().default(''),
});

export const filesDuplicates = defineTool({
  id: 'files-duplicates',
  pack: 'archive',
  category: ARCHIVE_CATEGORY,
  title: { de: 'Hash-Duplikate', en: 'Hash duplicates' },
  description: {
    de: 'SHA-256-Duplikate über beliebige Dateien. Report + Lösch-Empfehlung, kein Löschen. Perceptual bleibt image-duplicates.',
    en: 'SHA-256 duplicates across any files. Report + delete recommendation, no deletion. Perceptual stays in image-duplicates.',
  },
  inputs: { accept: ['*/*'], multiple: true, min: 1, directory: true },
  outputs: { mime: [MIME.json, MIME.md] },
  options,
  licenses: ARCHIVE_LICENSES,
  seo: { keywords: ['duplikate', 'sha-256'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const all = await gatherFiles(files, parsed.rootPath);
    const map = new Map<string, string[]>();
    for (let i = 0; i < all.length; i++) {
      ctx.progress(i / all.length, all[i]!.name);
      const hash = await sha256(await all[i]!.bytes());
      const arr = map.get(hash) ?? [];
      arr.push(all[i]!.name);
      map.set(hash, arr);
    }
    const dupes = [...map.entries()].filter(([, n]) => n.length > 1).map(([hash, names]) => ({ hash, keep: names[0], deleteSuggest: names.slice(1) }));
    const md = ['# Duplikate', '', ...dupes.map((d) => `- behalten \`${d.keep}\`, Kandidaten: ${d.deleteSuggest.join(', ')}`)].join('\n');
    return {
      outputs: [
        neoFileFromBytes('duplicates.json', new TextEncoder().encode(JSON.stringify({ dupes }, null, 2)), MIME.json),
        neoFileFromBytes('duplicates.md', new TextEncoder().encode(md + '\n'), MIME.md),
      ],
      warnings: [],
      report: attachProvenance({ groups: dupes.length }, await createProvenance('files-duplicates', parsed, files)),
    };
  },
});
