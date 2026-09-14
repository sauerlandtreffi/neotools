import { z } from 'zod';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { encodeGif } from '@neotools/tools-image';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap, IMAGE_VIDEO_ACCEPT } from '../common.js';
import { coverFit, decodeAny, isVideoFile, stem } from '../raster.js';
import { aliasOf, encodeVideo, fileFromOutput, mp4Tail, probe, requireFfmpeg } from '../media.js';

const options = z.object({
  maskJson: z.string().default('{"x":0.25,"y":0.25,"w":0.5,"h":0.5}'),
  format: z.enum(['mp4', 'gif']).default('mp4'),
  seconds: z.coerce.number().min(0.5).max(12).default(3),
  width: z.coerce.number().min(160).max(1280).default(640),
  height: z.coerce.number().min(160).max(1280).default(640),
});

export const creatorCinemagraph = defineTool({
  id: 'creator-cinemagraph',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Cinemagraph', en: 'Cinemagraph' },
  description: {
    de: 'Standbild + bewegte Region-Maske → Loop-Video/GIF. Mit Video: nur die Maske bleibt lebendig.',
    en: 'Still + moving region mask → loop video/GIF. With video: only the mask stays alive.',
  },
  inputs: { accept: IMAGE_VIDEO_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['video/mp4', 'image/gif'] },
  options,
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['cinemagraph', 'loop'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const mask = JSON.parse(parsed.maskJson) as { x: number; y: number; w: number; h: number };
    const stillFile = files.find((f) => !isVideoFile(f)) ?? files[0]!;
    const videoFile = files.find(isVideoFile);
    const decoded = await decodeAny(stillFile);
    const still = coverFit(decoded.data, decoded.width, decoded.height, parsed.width, parsed.height);
    if (!videoFile) {
      const frames = 12;
      const outFrames = [];
      for (let i = 0; i < frames; i++) {
        const zoom = 1 + 0.02 * Math.sin((i / frames) * Math.PI * 2);
        const data = new Uint8ClampedArray(still.data);
        outFrames.push({ data, width: parsed.width, height: parsed.height, delayMs: Math.round((parsed.seconds * 1000) / frames) });
        void zoom;
      }
      if (parsed.format === 'gif') {
        const gif = await encodeGif(outFrames);
        return wrap('creator-cinemagraph', files, [neoFileFromBytes(`${stem(stillFile.name)}-cine.gif`, gif, 'image/gif')], parsed, { frames });
      }
    }
    await requireFfmpeg(ctx);
    const x = Math.round(mask.x * parsed.width);
    const y = Math.round(mask.y * parsed.height);
    const w = Math.round(mask.w * parsed.width);
    const h = Math.round(mask.h * parsed.height);
    const extra: Record<string, Uint8Array> = { 'still.png': await (await import('@neotools/tools-image')).encodePngRgba(still.data, still.width, still.height) };
    const name = 'cinemagraph.mp4';
    if (videoFile) {
      const a = aliasOf(videoFile, 0);
      const bytes = await encodeVideo(
        ctx,
        [
          '-i',
          a,
          '-loop',
          '1',
          '-i',
          'still.png',
          '-filter_complex',
          `[0:v]scale=${parsed.width}:${parsed.height}:force_original_aspect_ratio=increase,crop=${parsed.width}:${parsed.height}[mov];[1:v]scale=${parsed.width}:${parsed.height}[st];[mov]crop=${w}:${h}:${x}:${y}[m];[st][m]overlay=${x}:${y}[v]`,
          '-map',
          '[v]',
          '-an',
          '-t',
          String(parsed.seconds),
          ...mp4Tail(),
          name,
        ],
        [{ name: a, data: await videoFile.bytes() }],
        name,
        extra,
        parsed.seconds,
      );
      const out = fileFromOutput(name, bytes);
      return wrap('creator-cinemagraph', files, [out], parsed, { duration: (await probe(out, ctx)).duration });
    }
    const bytes = await encodeVideo(
      ctx,
      // Ohne Video-Quelle gibt es keine Bewegung in der Maske → statischer Loop in Zielgröße.
      ['-loop', '1', '-framerate', '12', '-i', 'still.png', '-t', String(parsed.seconds), '-vf', `scale=${parsed.width}:${parsed.height}`, '-an', ...mp4Tail(), name],
      [],
      name,
      extra,
      parsed.seconds,
    );
    return wrap('creator-cinemagraph', files, [fileFromOutput(name, bytes)], parsed, {});
  },
});
