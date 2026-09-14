import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { AUDIO_ACCEPT, wrap } from '../common.js';
import { isAudioFile, isImageFile } from '../raster.js';
import { aliasOf, encodeVideo, fileFromOutput, mp4Tail, probe, requireFfmpeg } from '../media.js';

const options = z.object({
  width: z.coerce.number().min(640).max(1920).default(1920),
  height: z.coerce.number().min(360).max(1080).default(1080),
});

export const creatorPodcastVideo = defineTool({
  id: 'creator-podcast-video',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Podcast-Video', en: 'Podcast video' },
  description: {
    de: 'MP3 + Cover + Waveform → MP4 (16:9).',
    en: 'MP3 + cover + waveform → MP4 (16:9).',
  },
  inputs: { accept: [...AUDIO_ACCEPT, 'image/png', 'image/jpeg', 'image/webp', '.png', '.jpg', '.webp'], multiple: true, min: 1 },
  outputs: { mime: ['video/mp4'] },
  options,
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['podcast video', 'waveform'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    await requireFfmpeg(ctx);
    const audio = files.find(isAudioFile) ?? files[0]!;
    const cover = files.find(isImageFile);
    const p = await probe(audio, ctx);
    const dur = p.duration || 3;
    const extra: Record<string, Uint8Array> = {};
    const a = aliasOf(audio, 0);
    const args = ['-i', a];
    if (cover) {
      extra['cover.png'] = await cover.bytes();
      args.push('-loop', '1', '-i', 'cover.png');
    }
    const { width: w, height: h } = parsed;
    const filter = cover
      ? `[1:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[bg];[0:a]showwaves=s=${w}x${Math.round(h * 0.28)}:mode=cline:colors=white[wv];[bg][wv]overlay=0:H-h[v]`
      : `color=c=0x1e1b4b:s=${w}x${h}:d=${dur}[bg];[0:a]showwaves=s=${w}x${Math.round(h * 0.28)}:mode=cline:colors=white[wv];[bg][wv]overlay=0:H-h[v]`;
    args.push('-filter_complex', filter, '-map', '[v]', '-map', '0:a', '-t', String(dur), ...mp4Tail(), 'podcast.mp4');
    const bytes = await encodeVideo(ctx, args, [{ name: a, data: await audio.bytes() }], 'podcast.mp4', extra, dur);
    const out = fileFromOutput('podcast.mp4', bytes);
    const info = await probe(out, ctx);
    return wrap('creator-podcast-video', files, [out], parsed, { duration: info.duration, width: w, height: h });
  },
});
