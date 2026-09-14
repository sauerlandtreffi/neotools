import { z } from 'zod';
import { defineTool, type NeoFile } from '@neotools/engine';
import { IMAGE_ACCEPT, IMAGE_AI_LICENSES } from '../licenses.js';
import { batchImages, encodeOut, extFor, outMime, stem } from './common.js';
import { decode, type RasterImage } from '../raster.js';
import { parseHexColor } from '../cv/color.js';
import { compositeAlpha, featherMask } from '../cv/filters.js';
import { runSegmentation } from '../models/runtime.js';
import { getModel } from '../models/catalog.js';
import { ModelMissingError } from '../models/errors.js';

const options = z.object({
  model: z.enum(['u2netp', 'isnet-general-q8']).default('u2netp'),
  threshold: z.coerce.number().min(0).max(1).default(0.45),
  feather: z.coerce.number().min(0).max(32).default(2),
  background: z.enum(['transparent', 'color', 'image']).default('transparent'),
  color: z.string().default('#ffffff'),
  format: z.enum(['png', 'webp']).default('png'),
  quality: z.coerce.number().min(0.1).max(1).default(0.92),
  confirmModelDownload: z.boolean().default(false),
});

export const imageRemoveBackground = defineTool({
  id: 'image-remove-background',
  pack: 'image',
  category: 'ai',
  title: { de: 'Hintergrund entfernen', en: 'Remove background' },
  description: {
    de: 'Hintergrund lokal per IS-Net/U²-Net (ONNX) entfernen. Ausgabe PNG/WebP mit Alpha, optional Farbe.',
    en: 'Remove background locally with IS-Net/U²-Net (ONNX). PNG/WebP with alpha, optional color fill.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png', 'image/webp'] },
  options,
  presets: [
    { id: 'cutout', title: { de: 'Freisteller', en: 'Cutout' }, options: { background: 'transparent', format: 'png' } },
    { id: 'white', title: { de: 'Weißer Hintergrund', en: 'White background' }, options: { background: 'color', color: '#ffffff' } },
  ],
  licenses: IMAGE_AI_LICENSES,
  seo: { keywords: ['hintergrund entfernen', 'remove background', 'u2net', 'isnet'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const modelId = parsed.model;
    const entry = getModel(modelId);
    if (entry && /AGPL|NC/i.test(entry.license)) {
      throw new Error(`Modell ${modelId} hat unzulässige Lizenz ${entry.license}.`);
    }
    let bgImage: RasterImage | undefined;
    const extras = files.filter((f) => /bg|hintergrund/i.test(f.name));
    if (parsed.background === 'image' && extras[0]) {
      bgImage = await decode(await extras[0].bytes(), extras[0].mime);
    }
    const work = files.filter((f) => f !== extras[0]);
    return batchImages(ctx, work.length ? work : files, parsed, async (file, img) => {
      try {
        const seg = await runSegmentation(modelId, img, ctx.platform, ctx, parsed.confirmModelDownload);
        const mask = featherMask(seg.mask, img.width, img.height, parsed.feather);
        const out = compositeAlpha(img, mask, parsed.threshold, {
          color: parsed.background === 'color' ? parseHexColor(parsed.color) : undefined,
          image: parsed.background === 'image' ? bgImage : undefined,
        });
        const mime = outMime(parsed.format);
        const encoded = await encodeOut(out, mime, `${stem(file.name)}-cutout.${extFor(mime)}`, parsed.quality);
        return { files: [encoded], extra: { backend: seg.backend, model: modelId } };
      } catch (err) {
        if (err instanceof ModelMissingError) {
          throw new Error(
            `${err.message} (${Math.round(err.sizeBytes / 1_000_000)} MB, ${err.license}). Kein Crash — Datei übersprungen.`,
          );
        }
        throw err;
      }
    });
  },
});

export type { NeoFile };
