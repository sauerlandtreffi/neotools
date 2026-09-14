import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap, IMAGE_ACCEPT } from '../common.js';
import { blit, coverFit, decodeAny, drawRect, encodeNamed, fillSolid, stem } from '../raster.js';

const options = z.object({
  kind: z.enum(['phone', 'tablet', 'window']).default('phone'),
  background: z.string().default('#e8e4dc'),
});

export const creatorDeviceMockup = defineTool({
  id: 'creator-device-mockup',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Device-Mockup', en: 'Device mockup' },
  description: {
    de: 'Screenshot in generischem Phone/Tablet/Window-Rahmen. Dieselben Frames wie image-screenshot-workshop (Preset mockup).',
    en: 'Screenshot in a generic phone/tablet/window frame. Same frames as image-screenshot-workshop (mockup preset).',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: false, min: 1 },
  outputs: { mime: ['image/png'] },
  options,
  presets: [
    { id: 'workshop', title: { de: 'Wie Screenshot-Werkstatt', en: 'Like screenshot workshop' }, options: { kind: 'phone' } },
  ],
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['device mockup', 'phone frame'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const shot = await decodeAny(files[0]!);
    const kind = parsed.kind;
    const bezel = kind === 'window' ? 8 : 18;
    const topExtra = kind === 'window' ? 28 : kind === 'tablet' ? 22 : 36;
    const bottomExtra = kind === 'phone' ? 28 : 16;
    const innerW = Math.min(720, shot.width);
    const innerH = Math.round(shot.height * (innerW / shot.width));
    const frameW = innerW + bezel * 2;
    const frameH = innerH + topExtra + bottomExtra;
    const canvasW = frameW + 80;
    const canvasH = frameH + 80;
    ctx.progress(0.4, kind);
    const canvas = fillSolid(canvasW, canvasH, parsed.background);
    const fx = 40;
    const fy = 32;
    drawRect(canvas.data, canvasW, canvasH, fx + 6, fy + 8, frameW, frameH, [30, 30, 30, 60], true);
    drawRect(canvas.data, canvasW, canvasH, fx, fy, frameW, frameH, [36, 38, 42, 255], true);
    if (kind === 'window') {
      drawRect(canvas.data, canvasW, canvasH, fx, fy, frameW, 26, [52, 56, 62, 255], true);
    } else {
      drawRect(canvas.data, canvasW, canvasH, fx + frameW / 2 - 18, fy + 10, 36, 8, [20, 20, 22, 255], true);
    }
    const fitted = coverFit(shot.data, shot.width, shot.height, innerW, innerH);
    blit(canvas.data, canvasW, canvasH, fitted.data, innerW, innerH, fx + bezel, fy + topExtra);
    const out = await encodeNamed(
      { width: canvasW, height: canvasH, data: canvas.data, meta: shot.meta },
      'png',
      `${stem(files[0]!.name)}-mockup.png`,
    );
    return wrap('creator-device-mockup', files, [out], parsed, {
      kind,
      related: 'image-screenshot-workshop#mockup',
    });
  },
});
