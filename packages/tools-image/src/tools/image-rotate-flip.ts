import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { hexToRgb } from '../codec/pixels.js';
import { flip, rotate90, rotateAngle } from '../ops/rotate.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, encodeImage, mapImages, outName } from './common.js';

const options = z.object({
  turns: z.enum(['0', '90', '180', '270']).default('0'),
  angle: z.coerce.number().min(-360).max(360).default(0),
  flipH: z.boolean().default(false),
  flipV: z.boolean().default(false),
  applyExifOrientation: z.boolean().default(true),
  background: z.string().default('#ffffff'),
  autocrop: z.boolean().default(true),
});

export const imageRotateFlip = defineTool({
  id: 'image-rotate-flip',
  pack: 'image',
  category: 'images',
  title: { de: 'Drehen / Spiegeln', en: 'Rotate / flip' },
  description: {
    de: '90/180/270, beliebiger Winkel mit Hintergrund/Autocrop, horizontal/vertikal, EXIF-Orientation einbrennen.',
    en: '90/180/270, arbitrary angle with background/autocrop, flip, bake EXIF orientation.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png'] },
  options,
  presets: [
    { id: 'exif', title: { de: 'EXIF einbrennen', en: 'Bake EXIF' }, options: { applyExifOrientation: true, turns: '0' } },
    { id: 'cw', title: { de: '90°', en: '90°' }, options: { turns: '90' } },
  ],
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['drehen', 'spiegeln', 'exif orientation'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return mapImages(
      ctx,
      files,
      async (file, img) => {
        let data = img.data;
        let w = img.width;
        let h = img.height;
        const map: Record<string, 1 | 2 | 3 | 0> = { '0': 0, '90': 1, '180': 2, '270': 3 };
        const t = map[parsed.turns] ?? 0;
        if (t) {
          const r = rotate90(data, w, h, t as 1 | 2 | 3);
          data = r.data;
          w = r.width;
          h = r.height;
        }
        if (parsed.angle) {
          const bg = hexToRgb(parsed.background);
          const r = rotateAngle(data, w, h, parsed.angle, [bg[0], bg[1], bg[2], 255], parsed.autocrop);
          data = r.data;
          w = r.width;
          h = r.height;
        }
        if (parsed.flipH || parsed.flipV) data = flip(data, w, h, parsed.flipH, parsed.flipV);
        return [await encodeImage({ ...img, data, width: w, height: h }, 'png', { keepMetadata: true }, outName(file.name, 'png'))];
      },
      parsed.applyExifOrientation,
    );
  },
});
