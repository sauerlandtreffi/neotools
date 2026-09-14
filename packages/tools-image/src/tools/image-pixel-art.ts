import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { resample } from '../codec/resample.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, encodeImage, mapImages, stem } from './common.js';

const options = z.object({
  scale: z.coerce.number().min(2).max(32).default(8),
  colors: z.coerce.number().min(2).max(64).default(16),
});

export const imagePixelArt = defineTool({
  id: 'image-pixel-art',
  pack: 'image',
  category: 'images',
  title: { de: 'Foto → Pixel-Art', en: 'Photo → pixel art' },
  description: { de: 'Pixel-Art mit Palette und Block-Skala.', en: 'Pixel art with palette and block scale.' },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png'] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['pixel art'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return mapImages(ctx, files, async (file, img) => {
      const sw = Math.max(1, Math.round(img.width / parsed.scale));
      const sh = Math.max(1, Math.round(img.height / parsed.scale));
      const small = resample(img.data, img.width, img.height, sw, sh, 'box');
      quantize(small.data, parsed.colors);
      const up = resample(small.data, sw, sh, sw * parsed.scale, sh * parsed.scale, 'box');
      return [await encodeImage({ ...img, width: up.width, height: up.height, data: up.data }, 'png', { keepMetadata: false }, `${stem(file.name)}-pixel.png`)];
    });
  },
});

function quantize(data: Uint8ClampedArray, colors: number): void {
  const step = Math.max(1, Math.round(256 / Math.cbrt(colors)));
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round((data[i] ?? 0) / step) * step;
    data[i + 1] = Math.round((data[i + 1] ?? 0) / step) * step;
    data[i + 2] = Math.round((data[i + 2] ?? 0) / step) * step;
  }
}
