import { z } from 'zod';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { encodePngRgba } from '@neotools/tools-image';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap, IMAGE_VIDEO_ACCEPT } from '../common.js';
import { decodeAny, isVideoFile } from '../raster.js';
import { aliasOf, encodeVideo, requireFfmpeg } from '../media.js';

const options = z.object({
  samples: z.coerce.number().min(16).max(1920).default(320),
  height: z.coerce.number().min(32).max(720).default(240),
});

export const creatorMovieBarcode = defineTool({
  id: 'creator-movie-barcode',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Movie-Barcode', en: 'Movie barcode' },
  description: {
    de: 'Video → Farb-Barcode (Mittelstreifen über die Zeit).',
    en: 'Video → color barcode (average strip over time).',
  },
  inputs: { accept: IMAGE_VIDEO_ACCEPT, multiple: false, min: 1 },
  outputs: { mime: ['image/png'] },
  options,
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['movie barcode'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const file = files[0]!;
    const cols: Array<[number, number, number]> = [];
    if (isVideoFile(file)) {
      await requireFfmpeg(ctx);
      const alias = aliasOf(file, 0);
      const w = 8;
      const h = 8;
      const raw = await encodeVideo(
        ctx,
        ['-i', alias, '-vf', `fps=${Math.max(1, Math.round(parsed.samples / 8))},scale=${w}:${h},format=rgba`, '-frames:v', String(parsed.samples), '-f', 'rawvideo', 'bc.rgba'],
        [{ name: alias, data: await file.bytes() }],
        'bc.rgba',
      );
      const stride = w * h * 4;
      for (let i = 0; i + stride <= raw.byteLength; i += stride) {
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let p = 0; p < stride; p += 4) {
          r += raw[i + p] ?? 0;
          g += raw[i + p + 1] ?? 0;
          b += raw[i + p + 2] ?? 0;
          n++;
        }
        cols.push([Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
      }
    } else {
      const img = await decodeAny(file);
      const step = Math.max(1, Math.floor(img.width / parsed.samples));
      for (let x = 0; x < img.width; x += step) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let y = 0; y < img.height; y++) {
          const i = (y * img.width + x) * 4;
          r += img.data[i] ?? 0;
          g += img.data[i + 1] ?? 0;
          b += img.data[i + 2] ?? 0;
        }
        cols.push([Math.round(r / img.height), Math.round(g / img.height), Math.round(b / img.height)]);
      }
    }
    const W = Math.max(cols.length, 16);
    const H = parsed.height;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let x = 0; x < W; x++) {
      const c = cols[Math.min(cols.length - 1, x)] ?? [0, 0, 0];
      for (let y = 0; y < H; y++) {
        const i = (y * W + x) * 4;
        data[i] = c[0];
        data[i + 1] = c[1];
        data[i + 2] = c[2];
        data[i + 3] = 255;
      }
    }
    return wrap('creator-movie-barcode', files, [neoFileFromBytes('movie-barcode.png', encodePngRgba(data, W, H), 'image/png')], parsed, {
      columns: cols.length,
    });
  },
});
