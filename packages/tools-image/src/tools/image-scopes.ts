import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { renderScopes, type ScopeKind } from '../ops/scopes.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, encodeImage, mapImages, stem } from './common.js';

const options = z.object({
  kinds: z.string().default('histogram,waveform,vectorscope,zebras,falsecolor'),
  zebra: z.coerce.number().min(0.5).max(1).default(0.92),
});

export const imageScopes = defineTool({
  id: 'image-scopes',
  pack: 'image',
  category: 'images',
  title: { de: 'Scopes', en: 'Scopes' },
  description: {
    de: 'Histogram, Waveform, Vectorscope, Zebras, False Color als Bild-Overlays.',
    en: 'Histogram, waveform, vectorscope, zebras, false color as image overlays.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: false, min: 1 },
  outputs: { mime: ['image/png'] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['histogram', 'waveform', 'vectorscope'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const kinds = parsed.kinds.split(/[\s,]+/).filter(Boolean) as ScopeKind[];
    return mapImages(ctx, files, async (file, img) => {
      const views = renderScopes(img.data, img.width, img.height, kinds, parsed.zebra);
      const outs = [];
      for (const v of views) {
        outs.push(await encodeImage({ ...img, width: v.width, height: v.height, data: v.data }, 'png', { keepMetadata: false }, `${stem(file.name)}-${v.kind}.png`));
      }
      return outs;
    });
  },
});
