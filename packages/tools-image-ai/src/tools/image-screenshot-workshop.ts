import { z } from 'zod';
import { defineTool, type VerificationReport } from '@neotools/engine';
import { IMAGE_ACCEPT, IMAGE_AI_LICENSES } from '../licenses.js';
import { batchImages, encodeOut, extFor, outMime, stem } from './common.js';
import { decode, type RasterImage } from '../raster.js';
import { applyStyle, boxVariance, hasJpegExif, type Box } from '../cv/filters.js';
import { stitchVertical } from '../cv/stitch.js';
import { cropRaster, detectAvatars, detectChromeBand, detectRedBadges, detectSidebar } from '../cv/ui-wash.js';
import { applyMockup } from '../cv/mockup.js';
import { screenshotVsPhoto } from '../cv/screenshot-score.js';
import { findSecrets } from '../secrets/patterns.js';
import { ocrRaster } from '../ocr/page.js';

const options = z.object({
  mode: z.enum(['leak', 'redact', 'wash', 'stitch', 'mockup', 'detect', 'all']).default('wash'),
  style: z.enum(['blur', 'pixelate', 'bar']).default('bar'),
  cropChrome: z.boolean().default(true),
  cropSidebar: z.boolean().default(false),
  washAvatars: z.boolean().default(true),
  washBadges: z.boolean().default(true),
  mockup: z.enum(['phone', 'tablet', 'window']).default('phone'),
  background: z.string().default('#e8e4dc'),
  ocr: z.boolean().default(true),
  format: z.enum(['png', 'jpeg']).default('png'),
  quality: z.coerce.number().min(0.1).max(1).default(0.92),
});

function wordBoxesToSecrets(
  words: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }>,
  fullText: string,
): Box[] {
  const hits = findSecrets(fullText);
  const boxes: Box[] = [];
  for (const hit of hits) {
    for (const w of words) {
      if (fullText.includes(w.text) && hit.text.includes(w.text)) {
        boxes.push({ x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h: w.bbox.y1 - w.bbox.y0 });
      }
    }
  }
  if (!boxes.length) {
    for (const w of words) {
      if (findSecrets(w.text).length) {
        boxes.push({ x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h: w.bbox.y1 - w.bbox.y0 });
      }
    }
  }
  return boxes;
}

export const imageScreenshotWorkshop = defineTool({
  id: 'image-screenshot-workshop',
  pack: 'image',
  category: 'ai',
  title: { de: 'Screenshot-Werkstatt', en: 'Screenshot workshop' },
  description: {
    de: 'Leak-Scan, Auto-Redact, UI-Wäsche, Long-Screenshot, Device-Mockup, Screenshot-vs-Foto — lokal.',
    en: 'Leak scan, auto-redact, UI wash, long screenshot, device mockup, screenshot-vs-photo — local.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png', 'image/jpeg', 'application/json'] },
  options,
  presets: [
    { id: 'wash', title: { de: 'Wäsche', en: 'Wash' }, options: { mode: 'wash' } },
    { id: 'leak', title: { de: 'Leak-Scan', en: 'Leak scan' }, options: { mode: 'leak' } },
    { id: 'redact', title: { de: 'Auto-Redact', en: 'Auto-redact' }, options: { mode: 'redact' } },
    { id: 'long', title: { de: 'Long-Screenshot', en: 'Long screenshot' }, options: { mode: 'stitch' } },
    { id: 'mockup', title: { de: 'Mockup', en: 'Mockup' }, options: { mode: 'mockup' } },
    { id: 'photo-vs-screenshot', title: { de: 'Foto vs. Screenshot', en: 'Photo vs screenshot' }, options: { mode: 'detect' } },
  ],
  privacySensitive: true,
  licenses: IMAGE_AI_LICENSES,
  seo: { keywords: ['screenshot', 'leak', 'redact', 'mockup', 'long screenshot'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    if (parsed.mode === 'stitch' && files.length >= 2) {
      const rasters: RasterImage[] = [];
      for (const f of files) rasters.push(await decode(await f.bytes(), f.mime));
      const stitched = stitchVertical(rasters);
      const mime = outMime(parsed.format);
      const out = await encodeOut(stitched, mime, `long-screenshot.${extFor(mime)}`, parsed.quality);
      return { outputs: [out], warnings: [], report: { overlap: true } };
    }

    return batchImages(ctx, files, parsed, async (file, img) => {
      let work: RasterImage = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
      const extra: Record<string, unknown> = {};
      const leakBoxes: Box[] = [];

      if (parsed.mode === 'detect' || parsed.mode === 'all') {
        extra.screenshotScore = screenshotVsPhoto(work, await file.bytes());
      }

      if (parsed.ocr && (parsed.mode === 'leak' || parsed.mode === 'redact' || parsed.mode === 'all')) {
        const ocr = await ocrRaster(work, ['deu', 'eng'], ctx);
        const secrets = findSecrets(ocr.text);
        extra.secrets = secrets;
        extra.ocrWarning = ocr.warning;
        leakBoxes.push(...wordBoxesToSecrets(ocr.words, ocr.text));
      }

      if (parsed.mode === 'leak') {
        extra.boxes = leakBoxes;
      }

      if (parsed.mode === 'redact' || parsed.mode === 'all') {
        for (const box of leakBoxes) applyStyle(work, box, parsed.style, 2);
        extra.redacted = leakBoxes.length;
      }

      if (parsed.mode === 'wash' || parsed.mode === 'all') {
        if (parsed.cropChrome) {
          const band = detectChromeBand(work);
          if (band) work = cropRaster(work, 0, band.y1, work.width, work.height - band.y1);
        }
        if (parsed.cropSidebar) {
          const side = detectSidebar(work);
          if (side) work = cropRaster(work, side.x1, 0, work.width - side.x1, work.height);
        }
        if (parsed.washAvatars) {
          for (const a of detectAvatars(work)) applyStyle(work, a, 'blur', 2);
        }
        if (parsed.washBadges) {
          for (const b of detectRedBadges(work)) applyStyle(work, b, 'bar', 1);
        }
      }

      if (parsed.mode === 'mockup' || parsed.mode === 'all') {
        work = applyMockup(work, parsed.mockup, parsed.background);
      }

      const mime = outMime(parsed.format);
      const out = await encodeOut(work, mime, `${stem(file.name)}-${parsed.mode}.${extFor(mime)}`, parsed.quality);
      return { files: [out], extra };
    });
  },
  async verify(_ctx, outputs, opts): Promise<VerificationReport> {
    const parsed = options.parse(opts);
    const checks: VerificationReport['checks'] = [];
    if (parsed.mode !== 'redact' && parsed.mode !== 'all' && parsed.mode !== 'wash') {
      return { passed: true, checks: [{ id: 'verify-skip', passed: true, detail: 'Kein Privacy-Redact in diesem Modus.' }] };
    }
    for (const file of outputs) {
      const bytes = await file.bytes();
      const img = await decode(bytes, file.mime);
      const v = boxVariance(img, { x: 0, y: 0, w: Math.min(8, img.width), h: Math.min(8, img.height) });
      checks.push({
        id: `${file.name}:readable`,
        passed: true,
        detail: `Ausgabe neu kodiert, Varianz-Stichprobe ${v.toFixed(1)}.`,
      });
      if (file.mime === 'image/jpeg') {
        checks.push({
          id: `${file.name}:exif`,
          passed: !hasJpegExif(bytes),
          detail: hasJpegExif(bytes) ? 'EXIF noch vorhanden' : 'Kein JPEG-EXIF.',
        });
      }
    }
    return { passed: checks.every((c) => c.passed), checks };
  },
});
