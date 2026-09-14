import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { detectFormat } from '../codec/detect.js';
import { encode } from '../codec/encode.js';
import { resample } from '../codec/resample.js';
import { ssim } from '../ops/ssim.js';
import type { ImageFormat } from '../codec/types.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, encodeImage, mapImages, outName } from './common.js';

const options = z.object({
  preset: z.enum(['light', 'medium', 'heavy', 'visuell-lossless', 'target']).default('medium'),
  targetSizeKb: z.coerce.number().min(0).max(50_000).default(0),
  ssimThreshold: z.coerce.number().min(0.5).max(1).default(0.97),
  format: z.enum(['same', 'jpeg', 'webp', 'avif', 'png', 'jxl']).default('same'),
});

const QUALITY: Record<string, number> = { light: 88, medium: 75, heavy: 55 };

export const imageCompress = defineTool({
  id: 'image-compress',
  pack: 'image',
  category: 'images',
  title: { de: 'Bild komprimieren', en: 'Compress image' },
  description: {
    de: 'Presets, Zielgröße (Binärsuche) oder visuell verlustfrei über SSIM. Nur übernehmen, wenn kleiner.',
    en: 'Presets, target size (binary search) or visually lossless via SSIM. Keep original if not smaller.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/jpeg', 'image/webp', 'image/avif', 'image/png'] },
  options,
  presets: [
    { id: 'light', title: { de: 'Leicht', en: 'Light' }, options: { preset: 'light' } },
    { id: 'medium', title: { de: 'Mittel', en: 'Medium' }, options: { preset: 'medium' } },
    { id: 'heavy', title: { de: 'Stark', en: 'Heavy' }, options: { preset: 'heavy' } },
    { id: 'visuell-lossless', title: { de: 'Ohne sichtbaren Schärfeverlust', en: 'Visually lossless' }, options: { preset: 'visuell-lossless' } },
  ],
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['bild komprimieren', 'jpeg quality', 'ssim'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return mapImages(ctx, files, async (file, img) => {
      const srcBytes = await file.bytes();
      const srcFormat = detectFormat(srcBytes, file.name, file.mime) ?? 'jpeg';
      const target = parsed.format === 'same' ? (srcFormat === 'png' || srcFormat === 'jpeg' || srcFormat === 'webp' || srcFormat === 'avif' || srcFormat === 'jxl' ? srcFormat : 'jpeg') : parsed.format;
      const format = target as ImageFormat;

      const tryEncode = async (quality: number, scale = 1) => {
        let work = img;
        if (scale < 0.999) {
          const r = resample(img.data, img.width, img.height, img.width * scale, img.height * scale, 'lanczos3');
          work = { ...img, width: r.width, height: r.height, data: r.data };
        }
        return encode(work, format, { quality, keepMetadata: false, optimize: format === 'png' });
      };

      let best = srcBytes;
      let usedQ = 100;
      if (parsed.preset === 'target' || parsed.targetSizeKb > 0) {
        const limit = Math.max(1, parsed.targetSizeKb) * 1024;
        let lo = 20;
        let hi = 95;
        let scale = 1;
        for (let i = 0; i < 8; i++) {
          const mid = Math.round((lo + hi) / 2);
          const cand = await tryEncode(mid, scale);
          if (cand.length <= limit) {
            best = cand;
            usedQ = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        if (best.length > limit) {
          for (const sc of [0.85, 0.7, 0.5]) {
            const cand = await tryEncode(40, sc);
            if (cand.length < best.length) best = cand;
            if (cand.length <= limit) break;
          }
        }
      } else if (parsed.preset === 'visuell-lossless') {
        let lo = 40;
        let hi = 95;
        let accepted: Uint8Array | undefined;
        for (let i = 0; i < 7; i++) {
          const mid = Math.round((lo + hi) / 2);
          const cand = await tryEncode(mid);
          const { decode } = await import('../codec/decode.js');
          const again = await decode({ bytes: cand, name: `t.${format}` });
          const score = ssim(img.data, img.width, img.height, again.data, again.width, again.height);
          if (score >= parsed.ssimThreshold && cand.length < srcBytes.length) {
            accepted = cand;
            usedQ = mid;
            hi = mid - 1;
          } else lo = mid + 1;
        }
        if (accepted) best = accepted;
      } else {
        const q = QUALITY[parsed.preset] ?? 75;
        const cand = await tryEncode(q);
        usedQ = q;
        if (cand.length < srcBytes.length) best = cand;
      }
      if (best.length >= srcBytes.length) {
        return [await encodeImage(img, srcFormat === 'svg' ? 'png' : (srcFormat as ImageFormat), { quality: 95, keepMetadata: true }, file.name)];
      }
      return [
        await encodeImage(
          img,
          format,
          { quality: usedQ, keepMetadata: false, optimize: format === 'png' },
          outName(file.name, format === 'jpeg' ? 'jpg' : format),
        ).then(async (f) => {
          const { neoFileFromBytes } = await import('@neotools/engine');
          return neoFileFromBytes(f.name, best, f.mime);
        }),
      ];
    });
  },
});
