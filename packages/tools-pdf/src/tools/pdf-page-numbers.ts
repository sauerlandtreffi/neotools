import { z } from 'zod';
import { StandardFonts, rgb } from 'pdf-lib';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  mapFiles,
} from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { loadPdf, savePdf, stem } from '../pdf-io.js';

const options = z.object({
  position: z
    .enum(['footer-center', 'footer-left', 'footer-right', 'header-center'])
    .default('footer-center'),
  format: z.string().default('Seite {n} von {total}'),
  start: z.coerce.number().int().default(1),
  fontSize: z.coerce.number().min(6).max(36).default(10),
});

export const pdfPageNumbers = defineTool({
  id: 'pdf-page-numbers',
  pack: 'pdf',
  category: 'pdf',
  title: { de: 'Seitenzahlen', en: 'Page numbers' },
  description: {
    de: 'Seitenzahlen mit Format „Seite {n} von {total}“, Position und Startnummer.',
    en: 'Page numbers with format “Page {n} of {total}”, position and start number.',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf] },
  options,
  presets: [
    {
      id: 'de-footer',
      title: { de: 'Fußzeile Deutsch', en: 'German footer' },
      options: { format: 'Seite {n} von {total}', position: 'footer-center' },
    },
    {
      id: 'en-footer',
      title: { de: 'Fußzeile Englisch', en: 'English footer' },
      options: { format: 'Page {n} of {total}', position: 'footer-center' },
    },
  ],
  licenses: PDF_LICENSES,
  seo: { keywords: ['seitenzahlen', 'page numbers'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const loaded = await mapFiles(files, async (file, i) => {
      ctx.progress(i / Math.max(files.length, 1), file.name);
      const doc = await loadPdf(file);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const total = doc.getPageCount();
      doc.getPages().forEach((page, idx) => {
        const n = parsed.start + idx;
        const label = parsed.format.replaceAll('{n}', String(n)).replaceAll('{total}', String(total));
        const { width, height } = page.getSize();
        const textW = font.widthOfTextAtSize(label, parsed.fontSize);
        const pad = 28;
        let x = (width - textW) / 2;
        let y = pad;
        if (parsed.position === 'footer-left') x = pad;
        if (parsed.position === 'footer-right') x = width - pad - textW;
        if (parsed.position === 'header-center') y = height - pad - parsed.fontSize;
        page.drawText(label, {
          x,
          y,
          size: parsed.fontSize,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
      });
      return savePdf(doc, `${stem(file.name)}-numbered.pdf`);
    });
    const provenance = await createProvenance('pdf-page-numbers', parsed, files);
    return {
      outputs: loaded.ok.map((r) => r.value),
      warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
      report: attachProvenance({ batch: loaded.protocol }, provenance),
    };
  },
});
