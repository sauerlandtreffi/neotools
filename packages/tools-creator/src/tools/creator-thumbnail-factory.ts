import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { applyTextWatermark } from '@neotools/tools-image';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap, IMAGE_VIDEO_ACCEPT } from '../common.js';
import { coverFit, decodeAny, drawSafeZone, encodeNamed, isVideoFile, stem } from '../raster.js';
import { aliasOf, encodeVideo, requireFfmpeg } from '../media.js';
import { decode } from '@neotools/tools-image';

const options = z.object({
  title: z.string().default(''),
  variants: z.coerce.number().min(1).max(8).default(3),
  width: z.coerce.number().min(320).max(1920).default(1280),
  height: z.coerce.number().min(180).max(1080).default(720),
  drawSafeZone: z.boolean().default(true),
});

export const creatorThumbnailFactory = defineTool({
  id: 'creator-thumbnail-factory',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Thumbnail-Fabrik', en: 'Thumbnail factory' },
  description: {
    de: 'Peak-Frames aus Video (oder Bild), Title-Safe-Overlay und Text mit gebündelter OFL-Font, mehrere Varianten.',
    en: 'Peak frames from video (or image), title-safe overlay and bundled OFL font text, several variants.',
  },
  inputs: { accept: IMAGE_VIDEO_ACCEPT, multiple: false, min: 1 },
  outputs: { mime: ['image/jpeg', 'image/png'] },
  options,
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['thumbnail', 'youtube thumbnail'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const file = files[0]!;
    const frames: Array<{ data: Uint8ClampedArray; width: number; height: number }> = [];
    if (isVideoFile(file)) {
      await requireFfmpeg(ctx);
      const alias = aliasOf(file, 0);
      const n = parsed.variants;
      const raw = 'peaks.rgba';
      const bytes = await encodeVideo(
        ctx,
        [
          '-i',
          alias,
          '-vf',
          `fps=1,scale=${parsed.width}:${parsed.height}:force_original_aspect_ratio=increase,crop=${parsed.width}:${parsed.height},format=rgba`,
          '-frames:v',
          String(Math.max(n, 4)),
          '-f',
          'rawvideo',
          raw,
        ],
        [{ name: alias, data: await file.bytes() }],
        raw,
      );
      const stride = parsed.width * parsed.height * 4;
      for (let i = 0; i + stride <= bytes.byteLength && frames.length < parsed.variants; i += stride) {
        frames.push({ data: new Uint8ClampedArray(bytes.subarray(i, i + stride)), width: parsed.width, height: parsed.height });
      }
    } else {
      const img = await decodeAny(file);
      frames.push(coverFit(img.data, img.width, img.height, parsed.width, parsed.height));
    }
    if (!frames.length) {
      const img = await decode({ bytes: await file.bytes(), name: file.name, mime: file.mime });
      frames.push(coverFit(img.data, img.width, img.height, parsed.width, parsed.height));
    }
    const outputs = [];
    const positions = ['s', 'n', 'center'] as const;
    for (let i = 0; i < Math.min(parsed.variants, frames.length); i++) {
      ctx.progress((i + 1) / parsed.variants, `thumb-${i}`);
      const f = frames[i]!;
      let pixels = new Uint8ClampedArray(f.data);
      if (parsed.drawSafeZone) pixels = new Uint8ClampedArray(drawSafeZone(pixels, f.width, f.height, 0.1));
      if (parsed.title) {
        await applyTextWatermark(pixels, f.width, f.height, parsed.title, {
          position: positions[i % positions.length]!,
          opacity: 0.95,
          scale: 1.6,
          color: '#ffffff',
        });
      }
      outputs.push(
        await encodeNamed(
          { width: f.width, height: f.height, data: pixels, meta: (await decodeAny(file).catch(() => ({ meta: undefined })))?.meta as never },
          'jpeg',
          `${stem(file.name)}-thumb-${i + 1}.jpg`,
          88,
        ),
      );
    }
    return wrap('creator-thumbnail-factory', files, outputs, parsed, { variants: outputs.length });
  },
});
