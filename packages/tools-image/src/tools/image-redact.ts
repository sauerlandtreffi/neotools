import { z } from 'zod';
import { defineTool, type VerificationReport } from '@neotools/engine';
import { hexToRgb } from '../codec/pixels.js';
import { boxBlur, pixelate } from '../ops/blur.js';
import { resolveBox } from '../ops/crop.js';
import { readImageMetadata } from '../meta/read.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, encodeImage, mapImages, outName, parseBoxesJson } from './common.js';

const options = z.object({
  boxesJson: z.string().default('[]'),
  mode: z.enum(['black', 'pixelate', 'blur']).default('black'),
  fill: z.string().default('#000000'),
  block: z.coerce.number().min(2).max(64).default(12),
  blurRadius: z.coerce.number().min(1).max(32).default(6),
});

function paint(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  boxes: ReturnType<typeof parseBoxesJson>,
  parsed: z.infer<typeof options>,
): void {
  const fill = hexToRgb(parsed.fill);
  for (const b of boxes) {
    const r = resolveBox(b, width, height);
    if (parsed.mode === 'pixelate') {
      pixelate(data, width, height, parsed.block, r.x, r.y, r.x + r.w, r.y + r.h);
      continue;
    }
    if (parsed.mode === 'blur') {
      const slice = new Uint8ClampedArray(r.w * r.h * 4);
      for (let y = 0; y < r.h; y++) {
        slice.set(data.subarray(((r.y + y) * width + r.x) * 4, ((r.y + y) * width + r.x + r.w) * 4), y * r.w * 4);
      }
      const blurred = boxBlur(slice, r.w, r.h, parsed.blurRadius, 3);
      for (let y = 0; y < r.h; y++) {
        data.set(blurred.subarray(y * r.w * 4, (y + 1) * r.w * 4), ((r.y + y) * width + r.x) * 4);
      }
      continue;
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const i = (y * width + x) * 4;
        data[i] = fill[0];
        data[i + 1] = fill[1];
        data[i + 2] = fill[2];
        data[i + 3] = 255;
      }
    }
  }
}

export const imageRedact = defineTool({
  id: 'image-redact',
  pack: 'image',
  category: 'images',
  title: { de: 'Bild redigieren', en: 'Redact image' },
  description: {
    de: 'Boxen (px/%), schwarz / Pixelate / Blur. Echte Pixeländerung, Metadaten-Strip, EXIF-Thumbnail weg. Danach Verifikation.',
    en: 'Boxes (px/%), black / pixelate / blur. Real pixel change, metadata strip, EXIF thumbnail gone. Then verify.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png'] },
  options,
  presets: [{ id: 'black', title: { de: 'Schwarz', en: 'Black' }, options: { mode: 'black' } }],
  privacySensitive: true,
  ui: { editor: 'image-boxes' },
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['schwärzen', 'redact', 'pixelate'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const boxes = parseBoxesJson(parsed.boxesJson);
    const result = await mapImages(ctx, files, async (file, img) => {
      const data = new Uint8ClampedArray(img.data);
      paint(data, img.width, img.height, boxes, parsed);
      const out = await encodeImage(
        { ...img, data, meta: { ...img.meta, exif: undefined, icc: undefined, xmp: undefined } },
        'png',
        { keepMetadata: false },
        outName(file.name, 'png'),
      );
      return [out];
    });
    return {
      ...result,
      report: { ...(result.report ?? {}), boxes, mode: parsed.mode, fill: parsed.fill },
    };
  },
  async verify(_ctx, outputs, opts) {
    const parsed = options.parse(opts);
    const boxes = parseBoxesJson(parsed.boxesJson);
    const fill = hexToRgb(parsed.fill);
    const checks: VerificationReport['checks'] = [];
    for (const file of outputs) {
      const bytes = await file.bytes();
      const meta = readImageMetadata(bytes, file.name);
      checks.push({ id: `${file.name}:thumb`, passed: !meta.thumbnail, detail: meta.thumbnail ? 'Thumbnail noch da' : 'kein Thumbnail' });
      checks.push({ id: `${file.name}:gps`, passed: !meta.gps, detail: meta.gps ? 'GPS noch da' : 'kein GPS' });
      const { decode } = await import('../codec/decode.js');
      const img = await decode({ bytes, name: file.name });
      for (let bi = 0; bi < boxes.length; bi++) {
        const r = resolveBox(boxes[bi]!, img.width, img.height);
        let sum = 0;
        let n = 0;
        let varAcc = 0;
        const samples: number[] = [];
        for (let y = r.y; y < r.y + r.h; y += Math.max(1, Math.floor(r.h / 8))) {
          for (let x = r.x; x < r.x + r.w; x += Math.max(1, Math.floor(r.w / 8))) {
            const i = (y * img.width + x) * 4;
            const d = Math.abs((img.data[i] ?? 0) - fill[0]) + Math.abs((img.data[i + 1] ?? 0) - fill[1]) + Math.abs((img.data[i + 2] ?? 0) - fill[2]);
            sum += d;
            samples.push(img.data[i] ?? 0);
            n += 1;
          }
        }
        const mean = n ? sum / n : 999;
        const m2 = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
        for (const s of samples) varAcc += (s - m2) ** 2;
        const variance = samples.length ? varAcc / samples.length : 999;
        const ok = parsed.mode === 'black' ? mean < 40 : variance < 900;
        checks.push({
          id: `${file.name}:box-${bi}`,
          passed: ok,
          detail: `meanΔ=${mean.toFixed(1)} var=${variance.toFixed(1)}`,
        });
      }
    }
    if (!boxes.length) {
      checks.push({ id: 'no-boxes', passed: false, detail: 'Keine Boxen — Verifikation rot (Regression).' });
    }
    return { passed: checks.every((c) => c.passed), checks };
  },
});
