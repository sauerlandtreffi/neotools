import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { IMAGE_ACCEPT, IMAGE_AI_LICENSES } from '../licenses.js';
import { batchImages, encodeOut, extFor, outMime, stem } from './common.js';
import { bilateral, nlmLight } from '../cv/filters.js';

const options = z.object({
  method: z.enum(['bilateral', 'nlm']).default('bilateral'),
  strength: z.coerce.number().min(0.2).max(3).default(1),
  format: z.enum(['png', 'jpeg', 'webp']).default('png'),
  quality: z.coerce.number().min(0.1).max(1).default(0.92),
});

export const imageDenoise = defineTool({
  id: 'image-denoise',
  pack: 'image',
  category: 'ai',
  title: { de: 'Denoise (Showcase)', en: 'Denoise (showcase)' },
  description: {
    de: 'Klassisches Bilateral / Non-Local-Means (immer verfügbar). Kein NAFNet — keine saubere kleine ONNX-Lizenz gefunden.',
    en: 'Classic bilateral / non-local-means (always on). No NAFNet — no small license-clean ONNX found.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png', 'image/jpeg', 'image/webp'] },
  options,
  presets: [
    { id: 'light', title: { de: 'Leicht', en: 'Light' }, options: { method: 'bilateral', strength: 0.8 } },
    { id: 'nlm', title: { de: 'NLM', en: 'NLM' }, options: { method: 'nlm', strength: 1 } },
  ],
  licenses: IMAGE_AI_LICENSES,
  seo: { keywords: ['denoise', 'entrauschen', 'bilateral'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return batchImages(ctx, files, parsed, async (file, img) => {
      const out =
        parsed.method === 'nlm'
          ? nlmLight(img, Math.round(3 * parsed.strength + 2), 1, 14 * parsed.strength)
          : bilateral(img, Math.round(2 * parsed.strength + 1), 22 * parsed.strength);
      const mime = outMime(parsed.format);
      return {
        files: [await encodeOut(out, mime, `${stem(file.name)}-denoise.${extFor(mime)}`, parsed.quality)],
        extra: { method: parsed.method, model: null, note: 'NAFNet-Slot leer (Lizenz/Größe).' },
      };
    });
  },
});
