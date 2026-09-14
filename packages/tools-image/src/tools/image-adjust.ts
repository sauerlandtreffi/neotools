import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { ADJUST_PRESETS, adjust, type AdjustPresetId } from '../ops/adjust.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, encodeImage, mapImages, outName } from './common.js';

const options = z.object({
  preset: z.enum(['none', 'vivid', 'fade', 'mono', 'sepia', 'cool', 'warm', 'invert']).default('none'),
  brightness: z.coerce.number().min(-1).max(1).default(0),
  contrast: z.coerce.number().min(-1).max(1).default(0),
  saturation: z.coerce.number().min(-1).max(1).default(0),
  warmth: z.coerce.number().min(-1).max(1).default(0),
  gamma: z.coerce.number().min(0.2).max(3).default(1),
  sharpness: z.coerce.number().min(0).max(2).default(0),
  grayscale: z.boolean().default(false),
  sepia: z.boolean().default(false),
  invert: z.boolean().default(false),
});

export const imageAdjust = defineTool({
  id: 'image-adjust',
  pack: 'image',
  category: 'images',
  title: { de: 'Anpassen', en: 'Adjust' },
  description: {
    de: 'Helligkeit, Kontrast, Sättigung, Wärme, Gamma, Schärfe, Graustufen, Sepia, Invertieren.',
    en: 'Brightness, contrast, saturation, warmth, gamma, sharpness, grayscale, sepia, invert.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png'] },
  options,
  presets: (Object.keys(ADJUST_PRESETS) as AdjustPresetId[]).map((id) => ({
    id,
    title: { de: id, en: id },
    options: { preset: id, ...ADJUST_PRESETS[id] },
  })),
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['helligkeit', 'kontrast', 'sättigung'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const preset = ADJUST_PRESETS[parsed.preset] ?? {};
    return mapImages(ctx, files, async (file, img) => {
      const data = adjust(img.data, img.width, img.height, { ...preset, ...parsed });
      return [await encodeImage({ ...img, data }, 'png', { keepMetadata: true }, outName(file.name, 'png'))];
    });
  },
});
