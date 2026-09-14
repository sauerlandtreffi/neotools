import { z } from 'zod';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { encodeGif, encodePngRgba } from '@neotools/tools-image';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap, IMAGE_ACCEPT } from '../common.js';
import { coverFit, decodeAny } from '../raster.js';
import { encodeVideo, fileFromOutput, mp4Tail, probe, requireFfmpeg } from '../media.js';

const options = z.object({
  format: z.enum(['mp4', 'gif']).default('mp4'),
  width: z.coerce.number().min(160).max(1920).default(720),
  height: z.coerce.number().min(160).max(1080).default(720),
  seconds: z.coerce.number().min(0.4).max(12).default(2),
});

export const creatorBeforeAfter = defineTool({
  id: 'creator-before-after',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Before/After-Slider', en: 'Before/after slider' },
  description: {
    de: 'Zwei Bilder → Wisch-Slider als Video oder GIF.',
    en: 'Two images → wipe slider as video or GIF.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 2 },
  outputs: { mime: ['video/mp4', 'image/gif'] },
  options,
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['before after', 'slider'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const a = coverFit((await decodeAny(files[0]!)).data, (await decodeAny(files[0]!)).width, (await decodeAny(files[0]!)).height, parsed.width, parsed.height);
    const bImg = await decodeAny(files[1]!);
    const b = coverFit(bImg.data, bImg.width, bImg.height, parsed.width, parsed.height);
    const frames = 16;
    const rgba: Uint8ClampedArray[] = [];
    for (let f = 0; f < frames; f++) {
      const cut = Math.round((f / (frames - 1)) * parsed.width);
      const frame = new Uint8ClampedArray(parsed.width * parsed.height * 4);
      for (let y = 0; y < parsed.height; y++) {
        for (let x = 0; x < parsed.width; x++) {
          const src = x < cut ? a.data : b.data;
          const i = (y * parsed.width + x) * 4;
          frame.set(src.subarray(i, i + 4), i);
        }
      }
      rgba.push(frame);
    }
    if (parsed.format === 'gif') {
      const gif = await encodeGif(
        rgba.map((data) => ({ data, width: parsed.width, height: parsed.height, delayMs: Math.round((parsed.seconds * 1000) / frames) })),
      );
      return wrap('creator-before-after', files, [neoFileFromBytes('before-after.gif', gif, 'image/gif')], parsed, { frames });
    }
    await requireFfmpeg(ctx);
    const raw = new Uint8Array(rgba.reduce((n, f) => n + f.length, 0));
    let o = 0;
    for (const f of rgba) {
      raw.set(f, o);
      o += f.length;
    }
    const name = 'before-after.mp4';
    const bytes = await encodeVideo(
      ctx,
      ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${parsed.width}x${parsed.height}`, '-r', String(frames / parsed.seconds), '-i', 'frames.rgba', ...mp4Tail(), name],
      [{ name: 'frames.rgba', data: raw }],
      name,
      undefined,
      parsed.seconds,
    );
    const out = fileFromOutput(name, bytes);
    void encodePngRgba;
    return wrap('creator-before-after', files, [out], parsed, { duration: (await probe(out, ctx)).duration, frames });
  },
});
