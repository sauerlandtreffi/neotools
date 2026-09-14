import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap } from '../common.js';
import { parseCaptionsAuto, toSrt } from '../captions.js';
import { isAudioFile, isImageFile, isTextish, isVideoFile } from '../raster.js';
import { aliasOf, encodeVideo, fileFromOutput, fontExtra, mp4Tail, probe, requireFfmpeg } from '../media.js';

const options = z.object({
  width: z.coerce.number().min(320).max(1920).default(1080),
  height: z.coerce.number().min(320).max(1920).default(1920),
});

export const creatorLyricVideo = defineTool({
  id: 'creator-lyric-video',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Lyric-Video', en: 'Lyric video' },
  description: {
    de: 'SRT/LRC + Hintergrund (Bild/Video/Farbe) → Video mit eingebrannten Lyrics.',
    en: 'SRT/LRC + background (image/video/color) → video with burned-in lyrics.',
  },
  inputs: { accept: ['application/x-subrip', 'text/plain', 'text/vtt', 'image/png', 'image/jpeg', 'video/mp4', 'audio/mpeg', 'audio/wav', '.srt', '.lrc', '.vtt', '.png', '.jpg', '.mp4', '.mp3', '.wav'], multiple: true, min: 1 },
  outputs: { mime: ['video/mp4'] },
  options,
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['lyric video', 'lrc'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    await requireFfmpeg(ctx);
    const caps = files.find(isTextish);
    if (!caps) throw new Error('SRT/LRC/JSON-Untertitel fehlen.');
    const cues = parseCaptionsAuto(new TextDecoder().decode(await caps.bytes()), caps.name);
    const bgVid = files.find(isVideoFile);
    const bgImg = files.find(isImageFile);
    const audio = files.find(isAudioFile);
    const extra = await fontExtra();
    extra['lyrics.srt'] = new TextEncoder().encode(toSrt(cues));
    const dur = Math.max(...cues.map((c) => c.end), 2);
    const name = 'lyric.mp4';
    const { width: w, height: h } = parsed;
    const args: string[] = [];
    const inputs: Array<{ name: string; data: Uint8Array }> = [];
    if (bgVid) {
      const a = aliasOf(bgVid, 0);
      args.push('-i', a);
      inputs.push({ name: a, data: await bgVid.bytes() });
    } else if (bgImg) {
      args.push('-loop', '1', '-i', 'bg.png');
      extra['bg.png'] = await bgImg.bytes();
    } else {
      args.push('-f', 'lavfi', '-i', `color=c=0x0b1220:s=${w}x${h}:d=${dur}`);
    }
    if (audio) {
      const a = aliasOf(audio, inputs.length);
      args.push('-i', a);
      inputs.push({ name: a, data: await audio.bytes() });
    }
    args.push(
      '-vf',
      `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},subtitles=lyrics.srt:fontsdir=.:force_style='FontName=Source Sans 3,Fontsize=28,Alignment=2'`,
      '-t',
      String(dur),
      ...mp4Tail(),
      name,
    );
    const bytes = await encodeVideo(ctx, args, inputs, name, extra, dur);
    const out = fileFromOutput(name, bytes);
    return wrap('creator-lyric-video', files, [out], parsed, { duration: (await probe(out, ctx)).duration, cues: cues.length });
  },
});
