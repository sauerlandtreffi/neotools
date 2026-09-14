import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { applyImageWatermark, applyTextWatermark, type WatermarkPosition } from '../ops/watermark.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, decodeFile, encodeImage, mapImages, outName } from './common.js';

const options = z.object({
  text: z.string().default('NeoTools'),
  position: z.enum(['center', 'nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'tile']).default('se'),
  opacity: z.coerce.number().min(0.05).max(1).default(0.45),
  scale: z.coerce.number().min(0.2).max(4).default(1),
  color: z.string().default('#ffffff'),
  useSecondFileAsMark: z.boolean().default(false),
});

export const imageWatermark = defineTool({
  id: 'image-watermark',
  pack: 'image',
  category: 'images',
  title: { de: 'Wasserzeichen (Bild)', en: 'Image watermark' },
  description: {
    de: 'Text (OFL-Font via opentype.js, isomorph) oder Bild-Wasserzeichen. Position, Kachelung, Opazität, Skalierung. Kein Entfernen.',
    en: 'Text (OFL font via opentype.js) or image watermark. Position, tile, opacity, scale. No removal.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png'] },
  options,
  presets: [
    { id: 'corner', title: { de: 'Ecke', en: 'Corner' }, options: { position: 'se', opacity: 0.4 } },
    { id: 'tile', title: { de: 'Kacheln', en: 'Tile' }, options: { position: 'tile', opacity: 0.18, scale: 0.7 } },
  ],
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['wasserzeichen', 'watermark'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const markFile = parsed.useSecondFileAsMark && files.length > 1 ? files[files.length - 1] : undefined;
    const mark = markFile ? await decodeFile(markFile) : undefined;
    const targets = markFile ? files.slice(0, -1) : files;
    return mapImages(ctx, targets, async (file, img) => {
      const data = new Uint8ClampedArray(img.data);
      if (mark) {
        applyImageWatermark(data, img.width, img.height, mark.data, mark.width, mark.height, {
          position: parsed.position as WatermarkPosition,
          opacity: parsed.opacity,
          scale: parsed.scale,
        });
      } else {
        await applyTextWatermark(data, img.width, img.height, parsed.text, {
          position: parsed.position as WatermarkPosition,
          opacity: parsed.opacity,
          scale: parsed.scale,
          color: parsed.color,
        });
      }
      return [await encodeImage({ ...img, data }, 'png', { keepMetadata: true }, outName(file.name, 'png'))];
    });
  },
});
