import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes } from '@neotools/engine';
import { ARCHIVE_CATEGORY, ARCHIVE_LICENSES } from '../licenses.js';
import { gatherFiles } from '../walk.js';
import { barsPng } from '../chart-png.js';

const options = z.object({
  rootPath: z.string().default(''),
});

export const filesSpaceRadar = defineTool({
  id: 'files-space-radar',
  pack: 'archive',
  category: ARCHIVE_CATEGORY,
  title: { de: 'Speicher-Radar', en: 'Space radar' },
  description: {
    de: 'Was frisst Speicher: Größen nach Typ/Ordner, Treemap-JSON, Balken-PNG, Markdown.',
    en: 'What eats space: sizes by type/folder, treemap JSON, bar PNG, Markdown.',
  },
  inputs: { accept: ['*/*'], multiple: true, min: 1, directory: true },
  outputs: { mime: [MIME.json, MIME.md, MIME.png] },
  options,
  licenses: ARCHIVE_LICENSES,
  seo: { keywords: ['speicher', 'treemap'] },
  async run(_ctx, files, opts) {
    const parsed = options.parse(opts);
    const all = await gatherFiles(files, parsed.rootPath);
    const byExt = new Map<string, number>();
    const byFolder = new Map<string, number>();
    for (const f of all) {
      const ext = (f.name.split('.').pop() ?? 'none').toLowerCase();
      byExt.set(ext, (byExt.get(ext) ?? 0) + f.size);
      const folder = f.name.includes('/') ? f.name.split('/')[0]! : '.';
      byFolder.set(folder, (byFolder.get(folder) ?? 0) + f.size);
    }
    const extRows = [...byExt.entries()].sort((a, b) => b[1] - a[1]);
    const treemap = {
      name: 'root',
      children: extRows.map(([name, size]) => ({ name, size })),
    };
    const md = [
      '# Speicher',
      '',
      ...extRows.map(([e, s]) => `- .${e}: ${(s / 1024).toFixed(1)} KB`),
      '',
    ].join('\n');
    const png = barsPng(extRows.map(([e]) => e), extRows.map(([, s]) => s));
    return {
      outputs: [
        neoFileFromBytes('space.json', new TextEncoder().encode(JSON.stringify({ byExt: Object.fromEntries(byExt), byFolder: Object.fromEntries(byFolder), treemap }, null, 2)), MIME.json),
        neoFileFromBytes('space.md', new TextEncoder().encode(md), MIME.md),
        neoFileFromBytes('space.png', png, MIME.png),
      ],
      warnings: [],
      report: attachProvenance({ files: all.length }, await createProvenance('files-space-radar', parsed, files)),
    };
  },
});
