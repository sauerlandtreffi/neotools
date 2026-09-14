import { z } from 'zod';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { imageToSvg } from '../ops/trace.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, mapImages, stem } from './common.js';

const options = z.object({
  threshold: z.coerce.number().min(16).max(240).default(128),
  hatch: z.boolean().default(false),
  invert: z.boolean().default(false),
});

export const imageToSvgTool = defineTool({
  id: 'image-to-svg',
  pack: 'image',
  category: 'images',
  title: { de: 'Foto → SVG / Hatch', en: 'Photo → SVG / hatch' },
  description: {
    de: 'Vektorisierung (MIT-Konturtracer, kein GPL-Potrace) und optionale Hatch-Linien für Plotter.',
    en: 'Vectorization (MIT contour tracer, not GPL Potrace) and optional hatch lines for plotters.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/svg+xml'] },
  options,
  licenses: [
    ...IMAGE_LICENSES,
    { name: 'NeoTools contour tracer (Potrace-inspired, original MIT)', license: 'MIT', url: 'https://opensource.org/licenses/MIT' },
  ],
  seo: { keywords: ['svg', 'potrace', 'hatch', 'plotter'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return mapImages(ctx, files, async (file, img) => {
      const svg = imageToSvg(img.data, img.width, img.height, {
        threshold: parsed.threshold,
        hatch: parsed.hatch,
        invert: parsed.invert,
      });
      return [neoFileFromBytes(`${stem(file.name)}.svg`, new TextEncoder().encode(svg), 'image/svg+xml')];
    });
  },
});
