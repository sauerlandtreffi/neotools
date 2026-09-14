import { z } from 'zod';
import { zipSync } from 'fflate';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { cropCircle, encode } from '@neotools/tools-image';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap, IMAGE_ACCEPT } from '../common.js';
import { coverFit, decodeAny, stem } from '../raster.js';

const options = z.object({
  platform: z.enum(['telegram', 'whatsapp']).default('telegram'),
  circle: z.boolean().default(true),
  emoji: z.string().default('😀'),
});

const MAX = 100 * 1024;

export const creatorStickerSet = defineTool({
  id: 'creator-sticker-set',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Sticker-Set', en: 'Sticker set' },
  description: {
    de: 'Telegram/WhatsApp WebP-Sticker 512² ≤ 100 KB, Kreis-/Freistellung. Hintergrund entfernen optional via image-remove-background.',
    en: 'Telegram/WhatsApp WebP stickers 512² ≤ 100 KB, circle crop. Background removal optional via image-remove-background.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/webp', 'application/zip', 'application/json'] },
  options,
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['sticker', 'telegram', 'whatsapp webp'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const zip: Record<string, Uint8Array> = {};
    const outputs = [];
    const emojis = parsed.emoji.split(/[\s,]+/).filter(Boolean);
    const map: Array<{ file: string; emoji: string; bytes: number }> = [];
    for (let i = 0; i < files.length; i++) {
      ctx.progress((i + 1) / files.length, files[i]!.name);
      const img = await decodeAny(files[i]!);
      let work = coverFit(img.data, img.width, img.height, 512, 512);
      if (parsed.circle) {
        const c = cropCircle(work.data, work.width, work.height);
        work = { data: c.data, width: c.width, height: c.height };
      }
      let best = await encode({ ...img, width: work.width, height: work.height, data: work.data }, 'webp', {
        quality: 70,
        keepMetadata: false,
      });
      let lo = 20;
      let hi = 80;
      for (let k = 0; k < 7; k++) {
        const mid = Math.round((lo + hi) / 2);
        const cand = await encode({ ...img, width: work.width, height: work.height, data: work.data }, 'webp', {
          quality: mid,
          keepMetadata: false,
        });
        if (cand.length <= MAX) {
          best = cand;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      const name = `${stem(files[i]!.name)}-512.webp`;
      zip[name] = best;
      outputs.push(neoFileFromBytes(name, best, 'image/webp'));
      map.push({ file: name, emoji: emojis[i] ?? emojis[0] ?? '😀', bytes: best.length });
    }
    const json = new TextEncoder().encode(JSON.stringify({ platform: parsed.platform, stickers: map }, null, 2));
    zip['stickers.json'] = json;
    outputs.unshift(neoFileFromBytes('sticker-set.zip', zipSync(zip, { level: 6 }), 'application/zip'));
    outputs.push(neoFileFromBytes('stickers.json', json, 'application/json'));
    return wrap('creator-sticker-set', files, outputs, parsed, { stickers: map });
  },
});
