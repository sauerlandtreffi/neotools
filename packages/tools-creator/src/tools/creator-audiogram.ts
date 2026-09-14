import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { AUDIO_ACCEPT, wrap } from '../common.js';
import { parseCaptionsAuto, toSrt } from '../captions.js';
import { isAudioFile, isImageFile, isTextish } from '../raster.js';
import { aliasOf, encodeVideo, fileFromOutput, fontExtra, fontFileName, mp4Tail, probe, requireFfmpeg } from '../media.js';

const options = z.object({
  ratio: z.enum(['1:1', '9:16']).default('1:1'),
  seconds: z.coerce.number().min(0).max(600).default(0),
});

export const creatorAudiogram = defineTool({
  id: 'creator-audiogram',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Audiogramm', en: 'Audiogram' },
  description: {
    de: 'Audio + Cover + Waveform + Captions (SRT) → Social-Video 1:1/9:16 (showwaves/drawtext/subtitles).',
    en: 'Audio + cover + waveform + captions (SRT) → social video 1:1/9:16 (showwaves/drawtext/subtitles).',
  },
  inputs: { accept: [...AUDIO_ACCEPT, 'image/png', 'image/jpeg', 'image/webp', 'application/x-subrip', 'text/plain', '.srt', '.png', '.jpg'], multiple: true, min: 1 },
  outputs: { mime: ['video/mp4'] },
  options,
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['audiogram', 'waveform video'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    await requireFfmpeg(ctx);
    const audio = files.find(isAudioFile) ?? files[0]!;
    const cover = files.find(isImageFile);
    const capFile = files.find(isTextish);
    const p = await probe(audio, ctx);
    const dur = parsed.seconds || p.duration || 3;
    const [w, h] = parsed.ratio === '9:16' ? [1080, 1920] : [1080, 1080];
    const extra = await fontExtra();
    if (capFile) extra['caps.srt'] = new TextEncoder().encode(toSrt(parseCaptionsAuto(new TextDecoder().decode(await capFile.bytes()), capFile.name)));
    const a = aliasOf(audio, 0);
    const inputs = [{ name: a, data: await audio.bytes() }];
    const name = 'audiogram.mp4';
    const waves = `showwaves=s=${w}x${Math.round(h * 0.22)}:mode=cline:colors=white:rate=25`;
    let filter: string;
    const args = ['-i', a];
    if (cover) {
      args.push('-loop', '1', '-i', 'cover.png');
      extra['cover.png'] = await cover.bytes();
      filter = `[1:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[bg];[0:a]${waves}[wv];[bg][wv]overlay=0:H-h[v]`;
    } else {
      filter = `color=c=0x111827:s=${w}x${h}:d=${dur}[bg];[0:a]${waves}[wv];[bg][wv]overlay=0:H-h[v]`;
    }
    if (extra['caps.srt']) filter += `;[v]subtitles=caps.srt:fontsdir=.:force_style='FontName=Source Sans 3,Fontsize=22'[vout]`;
    else filter += `;[v]null[vout]`;
    args.push('-filter_complex', filter, '-map', '[vout]', '-map', '0:a', '-t', String(dur), ...mp4Tail(), name);
    void fontFileName;
    const bytes = await encodeVideo(ctx, args, inputs, name, extra, dur);
    const out = fileFromOutput(name, bytes);
    const info = await probe(out, ctx);
    return wrap('creator-audiogram', files, [out], parsed, { duration: info.duration, width: w, height: h });
  },
});
