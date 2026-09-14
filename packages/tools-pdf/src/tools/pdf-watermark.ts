import { z } from 'zod';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
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
  text: z.string().default('VERTRAULICH'),
  opacity: z.coerce.number().min(0).max(1).default(0.28),
  rotation: z.coerce.number().default(-32),
  position: z.enum(['center', 'tl', 'tr', 'bl', 'br']).default('center'),
  fontSize: z.coerce.number().min(4).max(200).default(48),
});

function anchor(
  position: z.infer<typeof options>['position'],
  pageW: number,
  pageH: number,
  textW: number,
  size: number,
): { x: number; y: number } {
  const pad = 36;
  switch (position) {
    case 'tl':
      return { x: pad, y: pageH - pad - size };
    case 'tr':
      return { x: pageW - pad - textW, y: pageH - pad - size };
    case 'bl':
      return { x: pad, y: pad };
    case 'br':
      return { x: pageW - pad - textW, y: pad };
    default:
      return { x: (pageW - textW) / 2, y: (pageH - size) / 2 };
  }
}

export const pdfWatermark = defineTool({
  id: 'pdf-watermark',
  pack: 'pdf',
  category: 'pdf',
  title: { de: 'Wasserzeichen', en: 'Watermark' },
  description: {
    de: 'Textwasserzeichen mit Deckkraft, Rotation, Position und Schriftgröße (StandardFonts).',
    en: 'Text watermark with opacity, rotation, position and font size (StandardFonts).',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf] },
  options,
  presets: [
    {
      id: 'confidential',
      title: { de: 'Vertraulich', en: 'Confidential' },
      options: { text: 'VERTRAULICH', opacity: 0.22, rotation: -32, position: 'center' },
    },
    {
      id: 'draft',
      title: { de: 'Entwurf', en: 'Draft' },
      options: { text: 'ENTWURF', opacity: 0.2, rotation: -30, position: 'center' },
    },
  ],
  licenses: PDF_LICENSES,
  seo: { keywords: ['pdf watermark', 'wasserzeichen'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const loaded = await mapFiles(files, async (file, i) => {
      ctx.progress(i / Math.max(files.length, 1), file.name);
      const doc = await loadPdf(file);
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      for (const page of doc.getPages()) {
        const { width, height } = page.getSize();
        const textW = font.widthOfTextAtSize(parsed.text, parsed.fontSize);
        const { x, y } = anchor(parsed.position, width, height, textW, parsed.fontSize);
        page.drawText(parsed.text, {
          x,
          y,
          size: parsed.fontSize,
          font,
          rotate: degrees(parsed.rotation),
          opacity: parsed.opacity,
          color: rgb(0.55, 0.1, 0.1),
        });
      }
      return savePdf(doc, `${stem(file.name)}-watermark.pdf`);
    });
    const provenance = await createProvenance('pdf-watermark', parsed, files);
    return {
      outputs: loaded.ok.map((r) => r.value),
      warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
      report: attachProvenance({ batch: loaded.protocol }, provenance),
    };
  },
});

export { options as watermarkOptions };
void PDFDocument;
