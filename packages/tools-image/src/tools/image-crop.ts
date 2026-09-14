import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { ASPECT_PRESETS, boxFromAspect, cropCircle, cropRect, type Gravity } from '../ops/crop.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, encodeImage, mapImages, outName, parseBoxesJson } from './common.js';

const options = z.object({
  mode: z.enum(['rect', 'circle', 'aspect']).default('rect'),
  aspect: z.enum(['free', '1:1', '4:5', '9:16', '16:9', '3:2', 'a4']).default('free'),
  gravity: z.enum(['center', 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']).default('center'),
  boxesJson: z.string().default('[]'),
  format: z.enum(['png', 'webp', 'jpeg']).default('png'),
});

export const imageCrop = defineTool({
  id: 'image-crop',
  pack: 'image',
  category: 'images',
  title: { de: 'Zuschneiden', en: 'Crop' },
  description: {
    de: 'Rechteck (px/%), Aspect-Presets, Gravity. Kreis-Crop/Sticker als Preset (transparent, PNG/WebP).',
    en: 'Rectangle (px/%), aspect presets, gravity. Circle-crop/sticker as preset (transparent PNG/WebP).',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png', 'image/webp'] },
  options,
  presets: [
    { id: 'square', title: { de: '1:1', en: '1:1' }, options: { mode: 'aspect', aspect: '1:1' } },
    { id: 'story', title: { de: '9:16', en: '9:16' }, options: { mode: 'aspect', aspect: '9:16' } },
    { id: 'sticker', title: { de: 'Kreis-Crop / Sticker', en: 'Circle crop / sticker' }, options: { mode: 'circle', format: 'png' } },
  ],
  ui: { editor: 'image-boxes' },
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['zuschneiden', 'crop', 'sticker', 'kreis'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return mapImages(ctx, files, async (file, img) => {
      const boxes = parseBoxesJson(parsed.boxesJson);
      let result;
      if (parsed.mode === 'circle') {
        result = cropCircle(img.data, img.width, img.height, boxes[0]);
      } else if (parsed.mode === 'aspect') {
        const ratio = ASPECT_PRESETS[parsed.aspect] ?? 0;
        const box = boxes[0] ?? boxFromAspect(img.width, img.height, ratio, parsed.gravity as Gravity);
        result = cropRect(img.data, img.width, img.height, box);
      } else {
        const box = boxes[0] ?? { x: 0, y: 0, w: img.width, h: img.height, unit: 'px' as const };
        result = cropRect(img.data, img.width, img.height, box);
      }
      const fmt = parsed.mode === 'circle' && parsed.format === 'jpeg' ? 'png' : parsed.format;
      return [
        await encodeImage(
          { ...img, ...result },
          fmt,
          { quality: 92, keepMetadata: true },
          outName(file.name, fmt === 'jpeg' ? 'jpg' : fmt),
        ),
      ];
    });
  },
});
