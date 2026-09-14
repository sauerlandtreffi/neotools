import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { luma } from '../codec/pixels.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, encodeImage, mapImages, stem } from './common.js';

const options = z.object({
  strength: z.coerce.number().min(0.2).max(8).default(2),
});

export const imageNormalMap = defineTool({
  id: 'image-normal-map',
  pack: 'image',
  category: 'images',
  title: { de: 'Normal Map', en: 'Normal map' },
  description: { de: 'Sobel-Höhenfeld → Tangent-Space-Normal Map.', en: 'Sobel height field → tangent-space normal map.' },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png'] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['normal map'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return mapImages(ctx, files, async (file, img) => {
      const { width: w, height: h, data } = img;
      const out = new Uint8ClampedArray(data.length);
      const hgt = (x: number, y: number) => luma(data[(y * w + x) * 4] ?? 0, data[(y * w + x) * 4 + 1] ?? 0, data[(y * w + x) * 4 + 2] ?? 0) / 255;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const dx = (hgt(x + 1, y) - hgt(x - 1, y)) * parsed.strength;
          const dy = (hgt(x, y + 1) - hgt(x, y - 1)) * parsed.strength;
          const nx = -dx;
          const ny = -dy;
          const nz = 1;
          const len = Math.hypot(nx, ny, nz) || 1;
          const i = (y * w + x) * 4;
          out[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
          out[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
          out[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
          out[i + 3] = 255;
        }
      }
      return [await encodeImage({ ...img, data: out }, 'png', { keepMetadata: false }, `${stem(file.name)}-normal.png`)];
    });
  },
});
