import { z } from 'zod';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  mapFiles,
} from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { parseNumberList } from '../page-ranges.js';
import { copyPagesToNew, loadPdf, savePdf, stem } from '../pdf-io.js';

const options = z.object({
  order: z
    .union([z.array(z.coerce.number()), z.string()])
    .transform((v) => parseNumberList(v))
    .default([]),
  delete: z
    .union([z.array(z.coerce.number()), z.string()])
    .transform((v) => parseNumberList(v))
    .default([]),
});

export const pdfReorder = defineTool({
  id: 'pdf-reorder',
  pack: 'pdf',
  category: 'pdf',
  title: { de: 'Seiten ordnen', en: 'Reorder pages' },
  description: {
    de: 'Seitenreihenfolge als 1-basierte Liste festlegen. Nicht gelistete oder gelöschte Seiten entfallen.',
    en: 'Set page order as a 1-based list. Omitted or deleted pages are dropped.',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf] },
  options,
  licenses: PDF_LICENSES,
  seo: { keywords: ['pdf reorder', 'seiten sortieren', 'seiten löschen'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const loaded = await mapFiles(files, async (file, i) => {
      ctx.progress(i / Math.max(files.length, 1), file.name);
      const src = await loadPdf(file);
      const count = src.getPageCount();
      const deleted = new Set(parsed.delete.filter((n) => n >= 1 && n <= count).map((n) => n - 1));
      let order: number[];
      if (parsed.order.length) {
        order = parsed.order.filter((n) => n >= 1 && n <= count).map((n) => n - 1);
        order = order.filter((idx) => !deleted.has(idx));
      } else {
        order = Array.from({ length: count }, (_, idx) => idx).filter((idx) => !deleted.has(idx));
      }
      if (!order.length) throw new Error('Keine Seiten übrig.');
      const doc = await copyPagesToNew(src, order);
      return savePdf(doc, `${stem(file.name)}-reordered.pdf`);
    });
    const provenance = await createProvenance('pdf-reorder', parsed, files);
    return {
      outputs: loaded.ok.map((r) => r.value),
      warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
      report: attachProvenance({ batch: loaded.protocol }, provenance),
    };
  },
});
