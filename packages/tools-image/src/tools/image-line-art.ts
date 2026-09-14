import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { luma } from '../codec/pixels.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, encodeImage, mapImages, stem } from './common.js';

const options = z.object({
  invert: z.boolean().default(false),
  strength: z.coerce.number().min(0.5).max(4).default(1.4),
});

export const imageLineArt = defineTool({
  id: 'image-line-art',
  pack: 'image',
  category: 'images',
  title: { de: 'Foto → Line-Art', en: 'Photo → line art' },
  description: { de: 'Kantenbild / Malbuch-Linien lokal.', en: 'Edge image / coloring-book lines locally.' },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png'] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['line art', 'malbuch'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return mapImages(ctx, files, async (file, img) => {
      const { width: w, height: h, data } = img;
      const out = new Uint8ClampedArray(data.length);
      const gy = (x: number, y: number) => luma(data[(y * w + x) * 4] ?? 0, data[(y * w + x) * 4 + 1] ?? 0, data[(y * w + x) * 4 + 2] ?? 0);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const gx = -gy(x - 1, y - 1) + gy(x + 1, y - 1) - 2 * gy(x - 1, y) + 2 * gy(x + 1, y) - gy(x - 1, y + 1) + gy(x + 1, y + 1);
          const gyy = -gy(x - 1, y - 1) - 2 * gy(x, y - 1) - gy(x + 1, y - 1) + gy(x - 1, y + 1) + 2 * gy(x, y + 1) + gy(x + 1, y + 1);
          let v = Math.min(255, Math.hypot(gx, gyy) * parsed.strength);
          if (!parsed.invert) v = 255 - v;
          const i = (y * w + x) * 4;
          out[i] = out[i + 1] = out[i + 2] = v;
          out[i + 3] = 255;
        }
      }
      return [await encodeImage({ ...img, data: out }, 'png', { keepMetadata: false }, `${stem(file.name)}-line.png`)];
    });
  },
});
