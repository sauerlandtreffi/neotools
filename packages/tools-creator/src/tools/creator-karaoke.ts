import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { AUDIO_ACCEPT, wrap } from '../common.js';
import { parseCaptionsAuto, toAssKaraoke } from '../captions.js';
import { isAudioFile, isImageFile, isTextish } from '../raster.js';
import { aliasOf, encodeVideo, fileFromOutput, fontExtra, mp4Tail, probe, requireFfmpeg } from '../media.js';

const options = z.object({
  reduceVocals: z.boolean().default(false),
  width: z.coerce.number().min(320).max(1920).default(1080),
  height: z.coerce.number().min(320).max(1920).default(1920),
});

export const creatorKaraoke = defineTool({
  id: 'creator-karaoke',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Karaoke', en: 'Karaoke' },
  description: {
    de: 'Audio + getimte Wörter → ASS mit Karaoke-Tags, einbrennen. Vocal-Reduktion analog audio-center-remove.',
    en: 'Audio + timed words → ASS with karaoke tags, burned in. Vocal reduction like audio-center-remove.',
  },
  inputs: { accept: [...AUDIO_ACCEPT, 'application/x-subrip', 'application/json', 'image/png', 'image/jpeg', '.srt', '.lrc', '.json', '.png', '.jpg'], multiple: true, min: 1 },
  outputs: { mime: ['video/mp4', 'text/x-ssa'] },
  options,
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['karaoke', 'ass'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    await requireFfmpeg(ctx);
    const audio = files.find(isAudioFile) ?? files[0]!;
    const caps = files.find(isTextish);
    if (!caps) throw new Error('Getimte Wörter (SRT/LRC/Transcript-JSON) fehlen.');
    const cues = parseCaptionsAuto(new TextDecoder().decode(await caps.bytes()), caps.name);
    const ass = toAssKaraoke(cues);
    const extra = await fontExtra();
    extra['karaoke.ass'] = new TextEncoder().encode(ass);
    const cover = files.find(isImageFile);
    if (cover) extra['cover.png'] = await cover.bytes();
    const p = await probe(audio, ctx);
    const dur = p.duration || Math.max(...cues.map((c) => c.end), 2);
    const a = aliasOf(audio, 0);
    const name = 'karaoke.mp4';
    const vocal = parsed.reduceVocals ? 'pan=stereo|c0=c0-c1|c1=c1-c0' : 'anull';
    const bg = cover
      ? `[1:v]scale=${parsed.width}:${parsed.height}:force_original_aspect_ratio=increase,crop=${parsed.width}:${parsed.height}[bg]`
      : `color=c=0x111111:s=${parsed.width}x${parsed.height}:d=${dur}[bg]`;
    const args = ['-i', a];
    if (cover) args.push('-loop', '1', '-i', 'cover.png');
    args.push(
      '-filter_complex',
      `${bg};[bg]ass=karaoke.ass:fontsdir=.[v];[0:a]${vocal}[a]`,
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-t',
      String(dur),
      ...mp4Tail(),
      name,
    );
    const bytes = await encodeVideo(ctx, args, [{ name: a, data: await audio.bytes() }], name, extra, dur);
    const out = fileFromOutput(name, bytes);
    return wrap(
      'creator-karaoke',
      files,
      [out, fileFromOutput('karaoke.ass', extra['karaoke.ass'])],
      parsed,
      { duration: (await probe(out, ctx)).duration, reduceVocals: parsed.reduceVocals },
    );
  },
});
