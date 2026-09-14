import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { IMAGE_ACCEPT, IMAGE_LICENSES, decodeFile, encodeImage, mapImages, stem } from './common.js';

const options = z.object({
  threshold: z.coerce.number().min(1.1).max(4).default(1.6),
});

export const imageRedEye = defineTool({
  id: 'image-red-eye',
  pack: 'image',
  category: 'images',
  title: { de: 'Rote Augen', en: 'Red-eye' },
  description: { de: 'Rote-Augen-Korrektur lokal über Farbheuristik.', en: 'Local red-eye correction via color heuristic.' },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png'] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['red eye'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return mapImages(ctx, files, async (file, img) => {
      const data = new Uint8ClampedArray(img.data);
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        if (r > 80 && r > (g + b) * parsed.threshold && r - g > 40) {
          const y = Math.round(0.3 * r + 0.5 * g + 0.2 * b);
          data[i] = y;
          data[i + 1] = Math.max(g, y);
          data[i + 2] = Math.max(b, y);
        }
      }
      return [await encodeImage({ ...img, data }, 'png', { keepMetadata: false }, `${stem(file.name)}-redeye.png`)];
    });
  },
});
