import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { luma } from '../codec/pixels.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, encodeImage, mapImages, stem } from './common.js';

const options = z.object({
  exposure: z.coerce.number().min(-4).max(4).default(0),
});

export const imageHdrTonemap = defineTool({
  id: 'image-hdr-tonemap',
  pack: 'image',
  category: 'images',
  title: { de: 'HDR ↔ SDR Tonemap', en: 'HDR ↔ SDR tonemap' },
  description: {
    de: 'Reinhard-Tonemap / Gain-Map-light. Kein EXR-Decoder (Community-Exotik).',
    en: 'Reinhard tonemap / light gain-map. No EXR decoder (community exotic).',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png'] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['hdr', 'tonemap'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const exp = 2 ** parsed.exposure;
    return mapImages(ctx, files, async (file, img) => {
      const data = new Uint8ClampedArray(img.data);
      for (let i = 0; i < data.length; i += 4) {
        const r = ((data[i] ?? 0) / 255) * exp;
        const g = ((data[i + 1] ?? 0) / 255) * exp;
        const b = ((data[i + 2] ?? 0) / 255) * exp;
        const y = luma(r * 255, g * 255, b * 255) / 255;
        const mapped = y / (1 + y);
        const s = y > 1e-6 ? mapped / y : 1;
        data[i] = Math.round(Math.min(1, r * s) * 255);
        data[i + 1] = Math.round(Math.min(1, g * s) * 255);
        data[i + 2] = Math.round(Math.min(1, b * s) * 255);
      }
      return [await encodeImage({ ...img, data }, 'png', { keepMetadata: false }, `${stem(file.name)}-sdr.png`)];
    });
  },
});
