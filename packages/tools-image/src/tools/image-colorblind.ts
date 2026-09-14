import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { daltonize, simulateColorblind } from '../ops/colorblind.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, encodeImage, mapImages, outName } from './common.js';

const options = z.object({
  mode: z.enum(['protan', 'deutan', 'tritan']).default('deutan'),
  action: z.enum(['simulate', 'daltonize']).default('simulate'),
});

export const imageColorblind = defineTool({
  id: 'image-colorblind',
  pack: 'image',
  category: 'images',
  title: { de: 'Farbblind-Simulator + Daltonize', en: 'Colorblind simulator + Daltonize' },
  description: {
    de: 'Protan / Deutan / Tritan simulieren oder Daltonize als Korrekturvorschau.',
    en: 'Simulate protan / deutan / tritan or Daltonize as a correction preview.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png'] },
  options,
  presets: [
    { id: 'deutan', title: { de: 'Deutan', en: 'Deutan' }, options: { mode: 'deutan', action: 'simulate' } },
    { id: 'daltonize', title: { de: 'Daltonize', en: 'Daltonize' }, options: { action: 'daltonize' } },
  ],
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['farbblind', 'daltonize', 'a11y'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return mapImages(ctx, files, async (file, img) => {
      const data = parsed.action === 'daltonize' ? daltonize(img.data, parsed.mode) : simulateColorblind(img.data, parsed.mode);
      return [await encodeImage({ ...img, data }, 'png', { keepMetadata: false }, outName(file.name, 'png'))];
    });
  },
});
