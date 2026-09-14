import { z } from 'zod';
import { defineTool, neoFileFromBytes, MIME, attachProvenance, createProvenance } from '@neotools/engine';
import { imageToAscii } from '../ops/ascii.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, decodeFile } from './common.js';

const options = z.object({
  width: z.coerce.number().min(10).max(240).default(80),
  charset: z.enum(['standard', 'detailed', 'blocks', 'braille']).default('standard'),
  invert: z.boolean().default(false),
});

export const imageAscii = defineTool({
  id: 'image-ascii',
  pack: 'image',
  category: 'images',
  title: { de: 'Bild → ASCII / Braille', en: 'Image → ASCII / Braille' },
  description: {
    de: 'Bild als ASCII- oder Braille-Text. Breite, Zeichensatz, Invertieren.',
    en: 'Image as ASCII or Braille text. Width, charset, invert.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: false, min: 1 },
  outputs: { mime: [MIME.txt] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['ascii art', 'braille'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    ctx.progress(0.4, files[0]!.name);
    const img = await decodeFile(files[0]!);
    const text = imageToAscii(img.data, img.width, img.height, {
      cols: parsed.width,
      charset: parsed.charset,
      invert: parsed.invert,
    });
    const provenance = await createProvenance('image-ascii', parsed, files);
    return {
      outputs: [neoFileFromBytes('ascii.txt', new TextEncoder().encode(text), MIME.txt)],
      warnings: [],
      report: attachProvenance({ lines: text.split('\n').length }, provenance),
    };
  },
});
