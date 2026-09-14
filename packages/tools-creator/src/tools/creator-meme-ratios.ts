import { z } from 'zod';
import { zipSync } from 'fflate';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap, IMAGE_ACCEPT } from '../common.js';
import { blurFill, coverFit, decodeAny, encodeNamed, stem } from '../raster.js';

const RATIOS: Record<string, [number, number]> = {
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
  '9:16': [1080, 1920],
  '16:9': [1920, 1080],
  '4:3': [1440, 1080],
};

const options = z.object({
  fill: z.enum(['blur', 'pad', 'cover']).default('blur'),
  ratios: z.string().default('1:1,4:5,9:16,16:9'),
});

export const creatorMemeRatios = defineTool({
  id: 'creator-meme-ratios',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Meme in allen Seitenverhältnissen', en: 'Meme in all aspect ratios' },
  description: {
    de: 'Ein Meme in 1:1, 4:5, 9:16, 16:9 mit Blur-Fill oder Padding.',
    en: 'One meme in 1:1, 4:5, 9:16, 16:9 with blur-fill or padding.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: false, min: 1 },
  outputs: { mime: ['image/jpeg', 'application/zip'] },
  options,
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['meme ratios', 'blur fill'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const img = await decodeAny(files[0]!);
    const zip: Record<string, Uint8Array> = {};
    const outputs = [];
    const keys = parsed.ratios.split(/[\s,]+/).filter((k) => RATIOS[k]);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const [w, h] = RATIOS[key]!;
      ctx.progress((i + 1) / keys.length, key);
      const fitted =
        parsed.fill === 'cover'
          ? coverFit(img.data, img.width, img.height, w, h)
          : blurFill(img.data, img.width, img.height, w, h);
      const name = `${stem(files[0]!.name)}-${key.replace(':', 'x')}.jpg`;
      const out = await encodeNamed({ ...img, width: w, height: h, data: fitted.data }, 'jpeg', name, 86);
      const bytes = await out.bytes();
      zip[name] = bytes;
      outputs.push(neoFileFromBytes(name, bytes, 'image/jpeg'));
    }
    outputs.unshift(neoFileFromBytes('meme-ratios.zip', zipSync(zip, { level: 6 }), 'application/zip'));
    return wrap('creator-meme-ratios', files, outputs, parsed, { ratios: keys });
  },
});
