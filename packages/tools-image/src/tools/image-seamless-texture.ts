import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { IMAGE_ACCEPT, IMAGE_LICENSES, encodeImage, mapImages, stem } from './common.js';

const options = z.object({});

export const imageSeamlessTexture = defineTool({
  id: 'image-seamless-texture',
  pack: 'image',
  category: 'images',
  title: { de: 'Nahtlose Textur', en: 'Seamless texture' },
  description: { de: 'Offset-Blend für kachelbare Texturen.', en: 'Offset-blend for tileable textures.' },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png'] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['seamless', 'tileable'] },
  async run(ctx, files) {
    return mapImages(ctx, files, async (file, img) => {
      const { width: w, height: h, data } = img;
      const out = new Uint8ClampedArray(data.length);
      const ox = w >> 1;
      const oy = h >> 1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const j = (((y + oy) % h) * w + ((x + ox) % w)) * 4;
          const wx = 1 - Math.abs((x - ox) / ox);
          const wy = 1 - Math.abs((y - oy) / oy);
          const a = Math.min(1, Math.max(0, (wx + wy) / 2));
          for (let c = 0; c < 3; c++) out[i + c] = Math.round((data[i + c] ?? 0) * a + (data[j + c] ?? 0) * (1 - a));
          out[i + 3] = 255;
        }
      }
      return [await encodeImage({ ...img, data: out }, 'png', { keepMetadata: false }, `${stem(file.name)}-seamless.png`)];
    });
  },
});
