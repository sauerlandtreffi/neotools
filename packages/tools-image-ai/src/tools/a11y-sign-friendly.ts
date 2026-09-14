import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { IMAGE_ACCEPT, IMAGE_AI_LICENSES } from '../licenses.js';
import { batchImages, encodeOut, stem } from './common.js';

const options = z.object({
  side: z.enum(['bottom', 'right', 'left']).default('bottom'),
  reserve: z.coerce.number().min(0.1).max(0.5).default(0.28),
  fill: z.string().default('#111827'),
});

function hexRgb(hex: string): [number, number, number] {
  const s = hex.replace(/^#/, '');
  if (s.length === 3) {
    return [parseInt(s[0]! + s[0], 16), parseInt(s[1]! + s[1], 16), parseInt(s[2]! + s[2], 16)];
  }
  return [parseInt(s.slice(0, 2), 16) || 17, parseInt(s.slice(2, 4), 16) || 24, parseInt(s.slice(4, 6), 16) || 39];
}

export const a11ySignFriendly = defineTool({
  id: 'a11y-sign-friendly',
  pack: 'a11y',
  category: 'a11y',
  title: { de: 'Gebärdenfreundlich rahmen', en: 'Sign-friendly frame' },
  description: {
    de: 'Reserviert Bildrand für Gebärdensprache (kein Avatar). Crop/Pad mit Safe-Area.',
    en: 'Reserves a margin for sign language (no avatar). Crop/pad with a safe area.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png'] },
  options,
  licenses: IMAGE_AI_LICENSES,
  seo: { keywords: ['sign language', 'gebärden', 'a11y'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const [fr, fg, fb] = hexRgb(parsed.fill);
    return batchImages(ctx, [...files], parsed, async (file, img) => {
      const extraW = parsed.side === 'bottom' ? 0 : Math.round(img.width * parsed.reserve);
      const extraH = parsed.side === 'bottom' ? Math.round(img.height * parsed.reserve) : 0;
      const w = img.width + extraW;
      const h = img.height + extraH;
      const ox = parsed.side === 'left' ? extraW : 0;
      const oy = 0;
      const out = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < out.length; i += 4) {
        out[i] = fr;
        out[i + 1] = fg;
        out[i + 2] = fb;
        out[i + 3] = 255;
      }
      for (let y = 0; y < img.height; y++) {
        const src = y * img.width * 4;
        const dst = ((y + oy) * w + ox) * 4;
        out.set(img.data.subarray(src, src + img.width * 4), dst);
      }
      const png = await encodeOut({ width: w, height: h, data: out }, 'image/png', `${stem(file.name)}-sign.png`);
      return { files: [png], extra: { side: parsed.side, reserve: parsed.reserve, width: w, height: h } };
    });
  },
});
