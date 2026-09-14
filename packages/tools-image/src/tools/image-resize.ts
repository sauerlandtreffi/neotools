import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { detectFormat } from '../codec/detect.js';
import { resample } from '../codec/resample.js';
import { unsharpMask } from '../ops/unsharp.js';
import type { ImageFormat } from '../codec/types.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, encodeImage, mapImages, outName } from './common.js';

const options = z.object({
  mode: z.enum(['pixels', 'percent', 'longest', 'box']).default('pixels'),
  width: z.coerce.number().min(0).max(16000).default(0),
  height: z.coerce.number().min(0).max(16000).default(0),
  percent: z.coerce.number().min(1).max(800).default(50),
  longest: z.coerce.number().min(1).max(16000).default(1920),
  allowUpscale: z.boolean().default(false),
  sharpen: z.boolean().default(true),
});

export const imageResize = defineTool({
  id: 'image-resize',
  pack: 'image',
  category: 'images',
  title: { de: 'Skalieren', en: 'Resize' },
  description: {
    de: 'Pixel, Prozent, längste Seite oder Fit-in-Box. Lanczos beim Downscale, bilinear beim Upscale, leichtes Schärfen.',
    en: 'Pixels, percent, longest side or fit-in-box. Lanczos downscale, bilinear upscale, light sharpen.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png', 'image/jpeg'] },
  options,
  presets: [
    { id: 'hd', title: { de: 'Längste Seite 1920', en: 'Longest 1920' }, options: { mode: 'longest', longest: 1920 } },
    { id: 'half', title: { de: '50 %', en: '50%' }, options: { mode: 'percent', percent: 50 } },
  ],
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['bild skalieren', 'resize', 'lanczos'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return mapImages(ctx, files, async (file, img) => {
      let tw = img.width;
      let th = img.height;
      if (parsed.mode === 'pixels') {
        tw = parsed.width || img.width;
        th = parsed.height || Math.round((img.height / img.width) * tw);
      } else if (parsed.mode === 'percent') {
        tw = Math.max(1, Math.round((img.width * parsed.percent) / 100));
        th = Math.max(1, Math.round((img.height * parsed.percent) / 100));
      } else if (parsed.mode === 'longest') {
        const long = Math.max(img.width, img.height);
        const s = parsed.longest / long;
        tw = Math.max(1, Math.round(img.width * s));
        th = Math.max(1, Math.round(img.height * s));
      } else {
        const boxW = parsed.width || parsed.longest;
        const boxH = parsed.height || parsed.longest;
        const s = Math.min(boxW / img.width, boxH / img.height);
        tw = Math.max(1, Math.round(img.width * s));
        th = Math.max(1, Math.round(img.height * s));
      }
      if (!parsed.allowUpscale && (tw > img.width || th > img.height)) {
        tw = img.width;
        th = img.height;
      }
      const down = tw < img.width || th < img.height;
      const r = resample(img.data, img.width, img.height, tw, th, down ? 'lanczos3' : 'bilinear');
      const data = down && parsed.sharpen ? unsharpMask(r.data, r.width, r.height, 0.4, 1) : r.data;
      const fmt = (detectFormat(await file.bytes(), file.name, file.mime) ?? 'png') as ImageFormat;
      const outFmt = fmt === 'svg' || fmt === 'heic' ? 'png' : fmt;
      return [
        await encodeImage(
          { ...img, width: r.width, height: r.height, data },
          outFmt,
          { quality: 90, keepMetadata: true },
          outName(file.name, outFmt === 'jpeg' ? 'jpg' : outFmt),
        ),
      ];
    });
  },
});
