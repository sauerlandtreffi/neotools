import { z } from 'zod';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  mapFiles,
} from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { everyNChunks, parseRanges } from '../page-ranges.js';
import { copyPagesToNew, loadPdf, padPage, savePdf, stem } from '../pdf-io.js';

const options = z.object({
  mode: z.enum(['each-page', 'ranges', 'every-n']).default('each-page'),
  ranges: z.string().default(''),
  everyN: z.coerce.number().int().min(1).default(2),
  maxSizeMb: z.coerce.number().min(0).default(0),
});

export const pdfSplit = defineTool({
  id: 'pdf-split',
  pack: 'pdf',
  category: 'pdf',
  title: { de: 'PDF teilen', en: 'Split PDF' },
  description: {
    de: 'Teilt PDFs: jede Seite, Seitenbereiche (1-3,5) oder alle N Seiten.',
    en: 'Split PDFs: every page, page ranges (1-3,5), or every N pages.',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf] },
  options,
  presets: [
    { id: 'pages', title: { de: 'Jede Seite', en: 'Each page' }, options: { mode: 'each-page' } },
    { id: 'pairs', title: { de: 'Je 2 Seiten', en: 'Every 2 pages' }, options: { mode: 'every-n', everyN: 2 } },
  ],
  licenses: PDF_LICENSES,
  seo: { keywords: ['pdf split', 'pdf teilen'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const outputs: Awaited<ReturnType<typeof savePdf>>[] = [];
    const loaded = await mapFiles(files, async (file, fi) => {
      ctx.progress(fi / Math.max(files.length, 1), file.name);
      const src = await loadPdf(file);
      const count = src.getPageCount();
      let groups: number[][] = [];
      if (parsed.mode === 'each-page') {
        groups = Array.from({ length: count }, (_, i) => [i]);
      } else if (parsed.mode === 'every-n') {
        groups = everyNChunks(count, parsed.everyN);
      } else {
        groups = parseRanges(parsed.ranges, count);
        if (!groups.length) throw new Error('Keine gültigen Seitenbereiche.');
      }
      if (parsed.maxSizeMb > 0) {
        const limit = parsed.maxSizeMb * 1024 * 1024;
        const packed: number[][] = [];
        let cur: number[] = [];
        for (const group of groups.length ? groups : [src.getPageIndices()]) {
          for (const idx of group) {
            const trial = [...cur, idx];
            const probe = await copyPagesToNew(src, trial);
            const bytes = await probe.save({ updateFieldAppearances: false });
            if (cur.length && bytes.byteLength > limit) {
              packed.push(cur);
              cur = [idx];
            } else cur = trial;
          }
        }
        if (cur.length) packed.push(cur);
        groups = packed;
      }
      const made = [];
      for (let g = 0; g < groups.length; g++) {
        const doc = await copyPagesToNew(src, groups[g]!);
        const first = (groups[g]![0] ?? 0) + 1;
        const last = (groups[g]![groups[g]!.length - 1] ?? 0) + 1;
        const name =
          groups[g]!.length === 1
            ? `${stem(file.name)}-p${padPage(first)}.pdf`
            : `${stem(file.name)}-p${padPage(first)}-${padPage(last)}.pdf`;
        made.push(await savePdf(doc, name));
      }
      return made;
    });
    for (const row of loaded.ok) outputs.push(...row.value);
    const provenance = await createProvenance('pdf-split', parsed, files);
    return {
      outputs,
      warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
      report: attachProvenance({ batch: loaded.protocol, outputCount: outputs.length }, provenance),
    };
  },
});
