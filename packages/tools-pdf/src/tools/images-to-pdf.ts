import { z } from 'zod';
import { PDFDocument } from 'pdf-lib';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  mapFiles,
} from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { savePdf } from '../pdf-io.js';

const A4 = { width: 595.28, height: 841.89 };
const LETTER = { width: 612, height: 792 };

const options = z.object({
  pageSize: z.enum(['a4', 'letter', 'image']).default('a4'),
  margin: z.coerce.number().min(0).max(200).default(36),
  outputName: z.string().default('images.pdf'),
});

function fit(boxW: number, boxH: number, imgW: number, imgH: number) {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const width = imgW * scale;
  const height = imgH * scale;
  return {
    width,
    height,
    x: (boxW - width) / 2,
    y: (boxH - height) / 2,
  };
}

export const imagesToPdf = defineTool({
  id: 'images-to-pdf',
  pack: 'pdf',
  category: 'convert',
  title: { de: 'Bilder zu PDF', en: 'Images to PDF' },
  description: {
    de: 'JPG/PNG zu einem PDF. Seitengröße A4, Letter oder Bildgröße, mit Rändern.',
    en: 'JPG/PNG into one PDF. Page size A4, Letter, or image size, with margins.',
  },
  inputs: {
    accept: [MIME.jpeg, MIME.png, 'image/jpg'],
    multiple: true,
    min: 1,
  },
  outputs: { mime: [MIME.pdf] },
  options,
  presets: [
    { id: 'a4', title: { de: 'A4', en: 'A4' }, options: { pageSize: 'a4', margin: 36 } },
    { id: 'fit', title: { de: 'Bildgröße', en: 'Image size' }, options: { pageSize: 'image', margin: 0 } },
  ],
  licenses: PDF_LICENSES,
  seo: { keywords: ['images to pdf', 'jpg zu pdf'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const doc = await PDFDocument.create();
    const loaded = await mapFiles(files, async (file, i) => {
      ctx.progress(i / Math.max(files.length, 1), file.name);
      const bytes = await file.bytes();
      const isPng = file.mime === MIME.png || file.name.toLowerCase().endsWith('.png');
      const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const margin = parsed.margin;
      if (parsed.pageSize === 'image') {
        const width = image.width + margin * 2;
        const height = image.height + margin * 2;
        const page = doc.addPage([width, height]);
        page.drawImage(image, { x: margin, y: margin, width: image.width, height: image.height });
        return file.name;
      }
      const box = parsed.pageSize === 'letter' ? LETTER : A4;
      const page = doc.addPage([box.width, box.height]);
      const innerW = box.width - margin * 2;
      const innerH = box.height - margin * 2;
      const placed = fit(innerW, innerH, image.width, image.height);
      page.drawImage(image, {
        x: margin + placed.x,
        y: margin + placed.y,
        width: placed.width,
        height: placed.height,
      });
      return file.name;
    });
    if (!loaded.ok.length) {
      return {
        outputs: [],
        warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
        report: { batch: loaded.protocol },
      };
    }
    const provenance = await createProvenance('images-to-pdf', parsed, files);
    return {
      outputs: [await savePdf(doc, parsed.outputName)],
      warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
      report: attachProvenance({ batch: loaded.protocol, pages: loaded.ok.length }, provenance),
    };
  },
});
