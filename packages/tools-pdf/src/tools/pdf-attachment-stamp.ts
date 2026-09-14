import { z } from 'zod';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes } from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { drawExhibitStamp, formatExhibitStamp } from '../stamp/exhibit.js';

const options = z.object({
  prefix: z.enum(['K', 'B']).default('K'),
  start: z.coerce.number().int().min(1).default(1),
  aktenzeichen: z.string().default(''),
  positionX: z.enum(['left', 'center', 'right']).default('right'),
  positionY: z.enum(['top', 'bottom']).default('top'),
  fontSize: z.coerce.number().min(6).max(24).default(10),
  frame: z.boolean().default(true),
  cover: z.boolean().default(false),
});

export const pdfAttachmentStamp = defineTool({
  id: 'pdf-attachment-stamp',
  pack: 'pdf',
  category: 'organize',
  title: { de: 'Anlagen-Stempel', en: 'Exhibit stamp' },
  description: {
    de: 'Stempel „Anlage K1 zu Az. …“ auf die erste Seite, optionales Deckblatt, JSON-Index. Kompatibel zu pdf-aktenbundler (anlagenPrefix).',
    en: 'Stamp “Exhibit K1 to case …” on the first page, optional cover, JSON index. Compatible with pdf-aktenbundler (anlagenPrefix).',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf, MIME.json] },
  options,
  licenses: PDF_LICENSES,
  seo: { keywords: ['anlage', 'stempel', 'aktenzeichen'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const outputs: ReturnType<typeof neoFileFromBytes>[] = [];
    const index: unknown[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      ctx.progress(i / files.length, file.name);
      const n = parsed.start + i;
      const label = formatExhibitStamp({ prefix: parsed.prefix, index: n, aktenzeichen: parsed.aktenzeichen });
      const src = await PDFDocument.load(await file.bytes(), { ignoreEncryption: true, updateMetadata: false });
      const out = await PDFDocument.create();
      const font = await out.embedFont(StandardFonts.HelveticaBold);
      if (parsed.cover) {
        const cover = out.addPage([595.28, 841.89]);
        cover.drawText(label, { x: 72, y: 500, size: 18, font });
        cover.drawText(file.name, { x: 72, y: 470, size: 11, font });
      }
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p, pi) => {
        out.addPage(p);
        if (pi === 0) {
          drawExhibitStamp(p, font, label, {
            x: parsed.positionX,
            y: parsed.positionY,
            size: parsed.fontSize,
            frame: parsed.frame,
          });
        }
      });
      const name = `${parsed.prefix}${n}-${file.name}`;
      outputs.push(neoFileFromBytes(name, new Uint8Array(await out.save({ updateFieldAppearances: false })), MIME.pdf));
      index.push({ file: file.name, output: name, label, index: n });
    }
    outputs.push(neoFileFromBytes('anlagen-index.json', new TextEncoder().encode(JSON.stringify(index, null, 2)), MIME.json));
    return {
      outputs,
      warnings: [],
      report: attachProvenance({ count: files.length, index }, await createProvenance('pdf-attachment-stamp', parsed, files)),
    };
  },
});
