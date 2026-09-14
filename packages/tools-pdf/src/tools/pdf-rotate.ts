import { z } from 'zod';
import { degrees } from 'pdf-lib';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  mapFiles,
} from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { parsePageSpec } from '../page-ranges.js';
import { loadPdf, savePdf, stem } from '../pdf-io.js';

const options = z.object({
  angle: z.union([z.literal(90), z.literal(180), z.literal(270), z.coerce.number()]).transform((n) => {
    const v = Number(n);
    if (![90, 180, 270].includes(v)) throw new Error('Winkel muss 90, 180 oder 270 sein.');
    return v as 90 | 180 | 270;
  }),
  pages: z.string().default('all'),
});

export const pdfRotate = defineTool({
  id: 'pdf-rotate',
  pack: 'pdf',
  category: 'pdf',
  title: { de: 'PDF drehen', en: 'Rotate PDF' },
  description: {
    de: 'Seiten um 90, 180 oder 270 Grad drehen. Seitenauswahl über 1-3,5 oder all.',
    en: 'Rotate pages by 90, 180 or 270 degrees. Select pages with 1-3,5 or all.',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf] },
  options,
  presets: [
    { id: 'cw', title: { de: '90° im Uhrzeigersinn', en: '90° clockwise' }, options: { angle: 90, pages: 'all' } },
    { id: '180', title: { de: '180°', en: '180°' }, options: { angle: 180, pages: 'all' } },
  ],
  licenses: PDF_LICENSES,
  seo: { keywords: ['pdf rotate', 'pdf drehen'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const loaded = await mapFiles(files, async (file, i) => {
      ctx.progress(i / Math.max(files.length, 1), file.name);
      const doc = await loadPdf(file);
      const targets = parsePageSpec(parsed.pages, doc.getPageCount());
      if (!targets.length) throw new Error('Keine passenden Seiten.');
      for (const idx of targets) {
        const page = doc.getPage(idx);
        const current = page.getRotation().angle;
        page.setRotation(degrees(((current + parsed.angle) % 360 + 360) % 360));
      }
      return savePdf(doc, `${stem(file.name)}-rotated.pdf`);
    });
    const provenance = await createProvenance('pdf-rotate', parsed, files);
    return {
      outputs: loaded.ok.map((r) => r.value),
      warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
      report: attachProvenance({ batch: loaded.protocol }, provenance),
    };
  },
});
