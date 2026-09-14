import { z } from 'zod';
import {
  defineTool,
  type NeoFile,
  type ToolContext,
  type VerificationReport,
} from '@neotools/engine';
import { IMAGE_ACCEPT, IMAGE_AI_LICENSES } from '../licenses.js';
import { batchImages, encodeOut, extFor, outMime, stem, decodeFile } from './common.js';
import { decode, type RasterImage } from '../raster.js';
import { applyStyle, boxVariance, hasJpegExif, hasPngTextChunk, type Box } from '../cv/filters.js';
import { heuristicFaceBoxes, boxesFromYunet } from '../cv/faces.js';
import { heuristicPlateBoxes, platesFromOcrWords } from '../cv/plates.js';
import { runOnnxRaw } from '../models/runtime.js';
import { detectPersons } from '../models/transformers.js';
import { ocrRaster } from '../ocr/page.js';
import { ModelMissingError } from '../models/errors.js';
import { isModelReady } from '../models/load.js';
import { getModel } from '../models/catalog.js';

const boxSchema = z.object({
  x: z.coerce.number(),
  y: z.coerce.number(),
  w: z.coerce.number(),
  h: z.coerce.number(),
});

const options = z.object({
  targets: z.enum(['face', 'plate', 'both']).default('both'),
  style: z.enum(['blur', 'pixelate', 'bar']).default('blur'),
  padding: z.coerce.number().min(0).max(80).default(8),
  minConfidence: z.coerce.number().min(0).max(1).default(0.55),
  boxes: z.array(boxSchema).default([]),
  format: z.enum(['png', 'jpeg']).default('png'),
  quality: z.coerce.number().min(0.1).max(1).default(0.92),
  confirmModelDownload: z.boolean().default(false),
});

async function detectFaces(img: RasterImage, ctx: ToolContext, parsed: z.infer<typeof options>): Promise<{ boxes: Box[]; notes: string[] }> {
  const notes: string[] = [];
  const boxes: Box[] = [];
  const yunet = getModel('yunet-face');
  if (yunet && (await isModelReady(yunet, ctx.platform))) {
    try {
      const raw = await runOnnxRaw('yunet-face', img, ctx.platform, ctx, parsed.confirmModelDownload);
      boxes.push(...boxesFromYunet(raw.outputs, img.width, img.height, raw.inputW, raw.inputH, parsed.minConfidence));
      notes.push('yunet');
    } catch (err) {
      notes.push(err instanceof ModelMissingError ? err.message : 'YuNet fehlgeschlagen, Heuristik.');
    }
  } else {
    notes.push('YuNet fehlt — Hautfarben-Heuristik.');
  }
  if (!boxes.length) boxes.push(...heuristicFaceBoxes(img));
  try {
    const persons = await detectPersons(img, ctx.platform, ctx, parsed.confirmModelDownload, parsed.minConfidence);
    if (persons.warning) notes.push(persons.warning);
    for (const p of persons.boxes) {
      boxes.push({ x: p.x, y: p.y, w: p.w, h: p.h * 0.45 });
    }
  } catch {
    // optional
  }
  return { boxes, notes };
}

async function detectPlates(img: RasterImage, ctx: ToolContext): Promise<{ boxes: Box[]; notes: string[] }> {
  const notes: string[] = [
    'Kein AGPL-Kennzeichenmodell (YOLOv8n-plate / OpenALPR verboten). Heuristik + OCR-Regex.',
  ];
  const boxes = heuristicPlateBoxes(img);
  const ocr = await ocrRaster(img, ['deu', 'eng'], ctx);
  if (ocr.warning) notes.push(ocr.warning);
  boxes.push(...platesFromOcrWords(ocr.words));
  return { boxes, notes };
}

export const imageAutoBlur = defineTool({
  id: 'image-auto-blur',
  pack: 'image',
  category: 'ai',
  title: { de: 'Gesicht / Kennzeichen unscharf', en: 'Auto-blur faces & plates' },
  description: {
    de: 'Gesichter (YuNet Apache-2.0) und Kennzeichen (OCR-Regex, kein AGPL-YOLO) lokal unkenntlich machen.',
    en: 'Blur faces (YuNet Apache-2.0) and plates (OCR regex, no AGPL YOLO) locally.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png', 'image/jpeg'] },
  options,
  presets: [
    { id: 'blur', title: { de: 'Weichzeichnen', en: 'Blur' }, options: { style: 'blur', targets: 'both' } },
    { id: 'pixel', title: { de: 'Verpixeln', en: 'Pixelate' }, options: { style: 'pixelate' } },
    { id: 'bar', title: { de: 'Balken', en: 'Bar' }, options: { style: 'bar' } },
  ],
  privacySensitive: true,
  licenses: IMAGE_AI_LICENSES,
  seo: { keywords: ['gesicht unscharf', 'kennzeichen', 'auto blur'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return batchImages(ctx, files, parsed, async (file, img) => {
      const notes: string[] = [];
      const found: Box[] = [...parsed.boxes];
      if (parsed.targets !== 'plate') {
        const faces = await detectFaces(img, ctx, parsed);
        found.push(...faces.boxes);
        notes.push(...faces.notes);
      }
      if (parsed.targets !== 'face') {
        const plates = await detectPlates(img, ctx);
        found.push(...plates.boxes);
        notes.push(...plates.notes);
      }
      const work = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
      for (const box of found) applyStyle(work, box, parsed.style, parsed.padding);
      const mime = outMime(parsed.format);
      const out = await encodeOut(work, mime, `${stem(file.name)}-blur.${extFor(mime)}`, parsed.quality);
      return {
        files: [out],
        extra: { boxes: found, notes },
      };
    });
  },
  async verify(ctx, outputs, opts): Promise<VerificationReport> {
    const parsed = options.parse(opts);
    const checks: VerificationReport['checks'] = [];
    for (const file of outputs) {
      const bytes = await file.bytes();
      const img = await decode(bytes, file.mime);
      const boxes = parsed.boxes;
      if (!boxes.length) {
        checks.push({
          id: `${file.name}:boxes`,
          passed: true,
          detail: 'Keine manuellen Boxen — Varianz der hellen Flächen nicht erzwungen.',
        });
      }
      for (let i = 0; i < boxes.length; i++) {
        const v = boxVariance(img, boxes[i]!);
        const passed = parsed.style === 'bar' ? v < 40 : v < 220;
        checks.push({
          id: `${file.name}:var-${i}`,
          passed,
          detail: `Pixelvarianz ${v.toFixed(1)} ${passed ? 'niedrig' : 'zu hoch — Inhalt lesbar?'}`,
        });
      }
      const meta =
        file.mime === 'image/jpeg'
          ? !hasJpegExif(bytes)
          : !hasPngTextChunk(bytes, 'exif') && !hasPngTextChunk(bytes, 'camera');
      checks.push({
        id: `${file.name}:meta`,
        passed: meta,
        detail: meta ? 'Keine EXIF/Kamera-Metadaten / kein Thumbnail-Chunk.' : 'Metadaten noch vorhanden.',
      });
    }
    void ctx;
    return { passed: checks.every((c) => c.passed), checks };
  },
});

export { decodeFile };
export type { NeoFile };
