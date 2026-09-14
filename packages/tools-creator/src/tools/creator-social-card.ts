import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { applyImageWatermark, applyTextWatermark } from '@neotools/tools-image';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap, IMAGE_ACCEPT } from '../common.js';
import { coverFit, decodeAny, encodeNamed, fillSolid, isImageFile } from '../raster.js';

const TEMPLATES: Record<string, { w: number; h: number; bg: string }> = {
  og: { w: 1200, h: 630, bg: '#0f172a' },
  twitter: { w: 1600, h: 900, bg: '#111827' },
  square: { w: 1080, h: 1080, bg: '#1e1b4b' },
};

const options = z.object({
  template: z.enum(['og', 'twitter', 'square']).default('og'),
  title: z.string().default('NeoTools'),
  subtitle: z.string().default('Lokal. Kein Upload.'),
  background: z.string().default(''),
});

export const creatorSocialCard = defineTool({
  id: 'creator-social-card',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Social-Card / OG', en: 'Social card / OG' },
  description: {
    de: 'OG/Social-Card mit Titel, Untertitel, Logo und Template — erweitert creator-export-pack.',
    en: 'OG/social card with title, subtitle, logo and template — extends creator-export-pack.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 0 },
  outputs: { mime: ['image/png', 'image/jpeg'] },
  options,
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['og image', 'social card'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const spec = TEMPLATES[parsed.template]!;
    const bgHex = parsed.background || spec.bg;
    let canvas = fillSolid(spec.w, spec.h, bgHex);
    const photo = files.find((f) => isImageFile(f) && !/logo/i.test(f.name));
    const logo = files.find((f) => /logo/i.test(f.name)) ?? files.find(isImageFile);
    if (photo) {
      const img = await decodeAny(photo);
      const fitted = coverFit(img.data, img.width, img.height, spec.w, spec.h);
      canvas = { data: new Uint8ClampedArray(fitted.data), width: spec.w, height: spec.h };
    }
    ctx.progress(0.5, parsed.title);
    await applyTextWatermark(canvas.data, spec.w, spec.h, parsed.title, {
      position: 'center',
      opacity: 1,
      scale: 2.2,
      color: '#ffffff',
    });
    if (parsed.subtitle) {
      await applyTextWatermark(canvas.data, spec.w, spec.h, parsed.subtitle, {
        position: 's',
        opacity: 0.9,
        scale: 1.1,
        color: '#e2e8f0',
      });
    }
    if (logo && logo !== photo) {
      const mark = await decodeAny(logo);
      applyImageWatermark(canvas.data, spec.w, spec.h, mark.data, mark.width, mark.height, {
        position: 'nw',
        opacity: 0.95,
        scale: 0.22,
      });
    }
    const out = await encodeNamed(
      { width: spec.w, height: spec.h, data: canvas.data, meta: (await decodeAny(files[0] ?? photo ?? logo!).catch(() => ({ meta: dummyMeta() }))).meta },
      'png',
      `social-${parsed.template}.png`,
    );
    return wrap('creator-social-card', files, [out], parsed, { template: parsed.template, width: spec.w, height: spec.h });
  },
});

function dummyMeta(): import('@neotools/tools-image').DecodedImage['meta'] {
  return { format: 'png', mime: 'image/png', orientation: 1, pages: 1, colorSpace: 'srgb', iccTagged: false, comments: [] };
}
