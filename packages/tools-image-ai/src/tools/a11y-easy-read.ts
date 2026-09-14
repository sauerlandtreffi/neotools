import { z } from 'zod';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { IMAGE_ACCEPT, IMAGE_AI_LICENSES } from '../licenses.js';
import { batchImages, encodeOut, stem } from './common.js';

const options = z.object({
  caption: z.string().default(''),
  contrast: z.coerce.number().min(1).max(3).default(1.6),
  invert: z.boolean().default(false),
});

function boostContrast(data: Uint8ClampedArray, factor: number, invert: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < out.length; i += 4) {
    const apply = (v: number) => {
      const n = invert ? 255 - v : v;
      return Math.max(0, Math.min(255, Math.round((n - 128) * factor + 128)));
    };
    out[i] = apply(out[i] ?? 0);
    out[i + 1] = apply(out[i + 1] ?? 0);
    out[i + 2] = apply(out[i + 2] ?? 0);
  }
  return out;
}

export const a11yEasyRead = defineTool({
  id: 'a11y-easy-read',
  pack: 'a11y',
  category: 'a11y',
  title: { de: 'Leicht-Lesen-Bild', en: 'Easy-read image' },
  description: {
    de: 'Hoher Kontrast, optionale große Bildunterschrift. Kein Cloud-LLM — Caption kommt vom Nutzer oder von image-alt-text.',
    en: 'High contrast plus optional large caption. No cloud LLM — caption is user-supplied or from image-alt-text.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png', 'text/plain'] },
  options,
  licenses: IMAGE_AI_LICENSES,
  seo: { keywords: ['easy read', 'leicht lesen', 'a11y'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const result = await batchImages(ctx, [...files], parsed, async (file, img) => {
      const data = boostContrast(img.data, parsed.contrast, parsed.invert);
      const png = await encodeOut({ ...img, data }, 'image/png', `${stem(file.name)}-easy-read.png`);
      const note = [
        'Leicht-Lesen / Easy Read',
        parsed.caption || '(keine Caption — image-alt-text vorschalten)',
        `Kontrast ${parsed.contrast}${parsed.invert ? ', invertiert' : ''}`,
      ].join('\n');
      return {
        files: [png, neoFileFromBytes(`${stem(file.name)}-easy-read.txt`, new TextEncoder().encode(note), 'text/plain')],
        extra: { caption: parsed.caption, contrast: parsed.contrast },
      };
    });
    return result;
  },
});
