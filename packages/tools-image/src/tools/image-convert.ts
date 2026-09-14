import { z } from 'zod';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { FORMAT_EXT, FORMAT_MIME, type ImageFormat } from '../codec/types.js';
import { encode } from '../codec/encode.js';
import { hexToRgb } from '../codec/pixels.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, formatFromOption, mapImages, outName } from './common.js';

const options = z.object({
  format: z
    .enum(['jpeg', 'jpg', 'png', 'webp', 'avif', 'jxl', 'gif', 'bmp', 'tga', 'ppm', 'pgm', 'pbm', 'ico', 'tiff', 'apng'])
    .default('jpeg'),
  quality: z.coerce.number().min(1).max(100).default(85),
  lossless: z.boolean().default(false),
  keepMetadata: z.boolean().default(true),
  background: z.string().default('#ffffff'),
  svgWidth: z.coerce.number().min(1).max(8192).default(1024),
});

export const imageConvert = defineTool({
  id: 'image-convert',
  pack: 'image',
  category: 'images',
  title: { de: 'Bild konvertieren', en: 'Convert image' },
  description: {
    de: 'JPG, PNG, WebP, AVIF, JXL, GIF, BMP, TIFF, ICO, HEIC, SVG, TGA, PNM, APNG lokal wandeln. HEIC→JPG und TIFF-Seiten als Presets.',
    en: 'Convert JPG, PNG, WebP, AVIF, JXL, GIF, BMP, TIFF, ICO, HEIC, SVG, TGA, PNM, APNG locally. HEIC→JPG and TIFF pages as presets.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff'] },
  options,
  presets: [
    { id: 'heic-jpg', title: { de: 'HEIC → JPG', en: 'HEIC → JPG' }, options: { format: 'jpeg', quality: 90, keepMetadata: true } },
    { id: 'png-webp', title: { de: 'PNG → WebP', en: 'PNG → WebP' }, options: { format: 'webp', quality: 80 } },
    { id: 'lossless-png', title: { de: 'Verlustfrei PNG', en: 'Lossless PNG' }, options: { format: 'png', lossless: true } },
  ],
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['bild konvertieren', 'heic to jpg', 'webp', 'avif', 'tiff'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const format = formatFromOption(parsed.format === 'jpg' ? 'jpeg' : parsed.format);
    const bg = hexToRgb(parsed.background);
    return mapImages(
      ctx,
      files,
      async (file, img) => {
        const outs = [];
        const pages = [img, ...(img.extraPages ?? [])];
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i]!;
          const bytes = await encode(page, format as ImageFormat, {
            quality: parsed.quality,
            lossless: parsed.lossless,
            keepMetadata: parsed.keepMetadata,
            background: bg,
          });
          const suffix = pages.length > 1 ? `-p${i + 1}` : '';
          outs.push(
            neoFileFromBytes(
              `${outName(file.name, FORMAT_EXT[format as ImageFormat]).replace(/(\.[^.]+)$/, `${suffix}$1`)}`,
              bytes,
              FORMAT_MIME[format as ImageFormat],
            ),
          );
        }
        return outs;
      },
      true,
    );
  },
});
