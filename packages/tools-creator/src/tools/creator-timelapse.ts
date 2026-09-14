import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { encodePngRgba } from '@neotools/tools-image';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap, IMAGE_ACCEPT } from '../common.js';
import { coverFit, decodeAny } from '../raster.js';
import { encodeVideo, fileFromOutput, mp4Tail, probe, requireFfmpeg } from '../media.js';

const options = z.object({
  fps: z.coerce.number().min(1).max(60).default(12),
  width: z.coerce.number().min(160).max(1920).default(1280),
  height: z.coerce.number().min(160).max(1080).default(720),
  deflicker: z.boolean().default(true),
});

export const creatorTimelapse = defineTool({
  id: 'creator-timelapse',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Zeitraffer', en: 'Timelapse' },
  description: {
    de: 'Foto-Serie → Video, optional FFmpeg-deflicker.',
    en: 'Photo series → video, optional FFmpeg deflicker.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 2, directory: true },
  outputs: { mime: ['video/mp4'] },
  options,
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['timelapse', 'deflicker'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    await requireFfmpeg(ctx);
    const extra: Record<string, Uint8Array> = {};
    const list: string[] = [];
    for (let i = 0; i < files.length; i++) {
      ctx.progress(i / files.length, files[i]!.name);
      const img = await decodeAny(files[i]!);
      const fitted = coverFit(img.data, img.width, img.height, parsed.width, parsed.height);
      const name = `f${String(i).padStart(4, '0')}.png`;
      extra[name] = encodePngRgba(fitted.data, parsed.width, parsed.height);
      list.push(`file ${name}`);
    }
    extra['list.txt'] = new TextEncoder().encode(list.join('\n'));
    const vf = parsed.deflicker ? `deflicker,fps=${parsed.fps}` : `fps=${parsed.fps}`;
    const name = 'timelapse.mp4';
    const bytes = await encodeVideo(
      ctx,
      ['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-vf', vf, ...mp4Tail(), name],
      [],
      name,
      extra,
      files.length / parsed.fps,
    );
    const out = fileFromOutput(name, bytes);
    return wrap('creator-timelapse', files, [out], parsed, { frames: files.length, duration: (await probe(out, ctx)).duration });
  },
});
