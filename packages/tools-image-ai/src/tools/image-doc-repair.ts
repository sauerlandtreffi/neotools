import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, mapFiles, neoFileFromBytes } from '@neotools/engine';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { IMAGE_ACCEPT, IMAGE_AI_LICENSES } from '../licenses.js';
import { encodeOut, extFor, outMime, stem } from './common.js';
import { decode, encode, type RasterImage } from '../raster.js';
import { findDocumentQuad } from '../cv/quad.js';
import { destSizeFromQuad, warpPerspective } from '../cv/homography.js';
import { estimateSkewDegrees, rotateRaster } from '../cv/deskew.js';
import { binarizeScan, brightenColor, descreen, removeShadows } from '../cv/shadow.js';
import { ocrRaster } from '../ocr/page.js';

const options = z.object({
  preset: z.enum(['scan', 'whiteboard', 'drawing', 'screen-photo', 'handwriting']).default('scan'),
  output: z.enum(['png', 'jpeg', 'pdf']).default('png'),
  binarize: z.boolean().optional(),
  deskew: z.boolean().default(true),
  perspective: z.boolean().default(true),
  ocr: z.boolean().default(false),
  quality: z.coerce.number().min(0.1).max(1).default(0.9),
});

function processPreset(img: RasterImage, preset: z.infer<typeof options>['preset'], doBin?: boolean): RasterImage {
  let out = img;
  if (preset === 'scan' || preset === 'handwriting') {
    out = removeShadows(out, 26);
    if (doBin ?? preset === 'scan') out = binarizeScan(out);
    else out = brightenColor(out, 1.08);
  } else if (preset === 'whiteboard') {
    out = removeShadows(out, 32);
    out = brightenColor(out, 1.2);
    if (doBin) out = binarizeScan(out);
  } else if (preset === 'drawing') {
    out = brightenColor(out, 1.25);
    out = removeShadows(out, 18);
  } else if (preset === 'screen-photo') {
    out = descreen(out);
    out = removeShadows(out, 14);
  }
  return out;
}

export const imageDocRepair = defineTool({
  id: 'image-doc-repair',
  pack: 'image',
  category: 'ai',
  title: { de: 'Dokument-Foto reparieren', en: 'Repair document photo' },
  description: {
    de: 'Perspektive entzerren, Schatten entfernen, binarisieren oder aufhellen. Optional A4-PDF + OCR-Textlayer.',
    en: 'Deskew, deskadow, binarize or brighten. Optional A4 PDF + OCR text layer.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png', 'image/jpeg', MIME.pdf] },
  options,
  presets: [
    { id: 'scan', title: { de: 'Scanner', en: 'Scan' }, options: { preset: 'scan', output: 'pdf', ocr: true } },
    { id: 'whiteboard', title: { de: 'Whiteboard', en: 'Whiteboard' }, options: { preset: 'whiteboard', output: 'png' } },
    { id: 'drawing', title: { de: 'Kinderzeichnung', en: 'Drawing' }, options: { preset: 'drawing', output: 'png' } },
    { id: 'screen-photo', title: { de: 'Bildschirmfoto', en: 'Screen photo' }, options: { preset: 'screen-photo' } },
    { id: 'handwriting', title: { de: 'Handschrift', en: 'Handwriting' }, options: { preset: 'handwriting', ocr: true } },
  ],
  licenses: IMAGE_AI_LICENSES,
  seo: { keywords: ['dokumentenscanner', 'perspektive', 'whiteboard', 'ocr'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const pages: RasterImage[] = [];
    const notes: unknown[] = [];
    const mapped = await mapFiles(files, async (file, i) => {
      ctx.progress(i / Math.max(files.length, 1), file.name);
      let img = await decode(await file.bytes(), file.mime);
      if (parsed.perspective) {
        const { quad, method } = findDocumentQuad(img);
        const size = destSizeFromQuad(quad);
        img = warpPerspective(img, quad, size.width, size.height);
        notes.push({ file: file.name, quad, method });
      }
      if (parsed.deskew) {
        const angle = estimateSkewDegrees(img);
        if (Math.abs(angle) > 0.3) img = rotateRaster(img, -angle, 255);
        notes.push({ file: file.name, skew: angle });
      }
      img = processPreset(img, parsed.preset, parsed.binarize);
      pages.push(img);
      return img;
    });
    const warnings = mapped.errors.map((e) => `${e.file}: ${e.reason}`);

    if (parsed.output === 'pdf') {
      const doc = await PDFDocument.create();
      for (const pageImg of pages) {
        const png = await encode(pageImg, 'image/png');
        const embedded = await doc.embedPng(png);
        const page = doc.addPage([595.28, 841.89]);
        const scale = Math.min((595.28 - 48) / embedded.width, (841.89 - 48) / embedded.height);
        const w = embedded.width * scale;
        const h = embedded.height * scale;
        page.drawImage(embedded, { x: (595.28 - w) / 2, y: (841.89 - h) / 2, width: w, height: h });
        if (parsed.ocr && ctx.platform.capabilities.ocr) {
          const ocr = await ocrRaster(pageImg, ['deu', 'eng'], ctx);
          if (ocr.warning) warnings.push(ocr.warning);
          if (ocr.text.trim()) {
            const font = await doc.embedFont(StandardFonts.Helvetica);
            page.drawText(ocr.text.slice(0, 4000), {
              x: 24,
              y: 18,
              size: 1,
              font,
              opacity: 0,
            });
          }
        }
      }
      const bytes = await doc.save();
      const provenance = await createProvenance('image-doc-repair', parsed, files);
      return {
        outputs: [neoFileFromBytes(`${stem(files[0]?.name ?? 'doc')}-repaired.pdf`, bytes, MIME.pdf)],
        warnings,
        report: attachProvenance({ batch: mapped.protocol, notes }, provenance),
      };
    }

    const mime = outMime(parsed.output);
    const outputs = [];
    for (let i = 0; i < pages.length; i++) {
      const src = mapped.ok[i]?.file;
      outputs.push(await encodeOut(pages[i]!, mime, `${stem(src?.name ?? `page-${i}`)}-repaired.${extFor(mime)}`, parsed.quality));
    }
    const provenance = await createProvenance('image-doc-repair', parsed, files);
    return {
      outputs,
      warnings,
      report: attachProvenance({ batch: mapped.protocol, notes }, provenance),
    };
  },
});
