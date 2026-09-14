import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap, IMAGE_VIDEO_ACCEPT } from '../common.js';
import { parseCaptionsAuto, toSrt, wordsFromCues } from '../captions.js';
import { isTextish, isVideoFile } from '../raster.js';
import { aliasOf, encodeVideo, fileFromOutput, fontExtra, mp4Tail, probe, requireFfmpeg } from '../media.js';

const options = z.object({
  style: z.enum(['impact', 'bold-outline', 'lower-third']).default('impact'),
});

const STYLES: Record<string, string> = {
  impact: "FontName=Source Sans 3,Fontsize=42,Bold=1,Outline=4,Alignment=2,PrimaryColour=&H00FFFFFF",
  'bold-outline': "FontName=Source Sans 3,Fontsize=36,Bold=1,Outline=3,Alignment=2,PrimaryColour=&H0000FFFF",
  'lower-third': "FontName=Source Sans 3,Fontsize=28,Alignment=2,MarginV=80,PrimaryColour=&H00FFFFFF",
};

export const creatorMemeCaptions = defineTool({
  id: 'creator-meme-captions',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Meme-Captions Wort für Wort', en: 'Word-by-word meme captions' },
  description: {
    de: 'Wort-für-Wort-Captions aus Transkript-JSON einbrennen, Stil-Presets.',
    en: 'Burn word-by-word captions from transcript JSON, style presets.',
  },
  inputs: { accept: [...IMAGE_VIDEO_ACCEPT, 'application/json', 'application/x-subrip', '.json', '.srt'], multiple: true, min: 1 },
  outputs: { mime: ['video/mp4'] },
  options,
  presets: [
    { id: 'impact', title: { de: 'Impact', en: 'Impact' }, options: { style: 'impact' } },
    { id: 'outline', title: { de: 'Outline', en: 'Outline' }, options: { style: 'bold-outline' } },
  ],
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['meme captions', 'word timestamps'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    await requireFfmpeg(ctx);
    const video = files.find(isVideoFile) ?? files[0]!;
    const caps = files.find(isTextish);
    if (!caps) throw new Error('Transkript-JSON oder SRT fehlt.');
    const cues = parseCaptionsAuto(new TextDecoder().decode(await caps.bytes()), caps.name);
    const words = wordsFromCues(cues);
    const wordCues = words.map((w) => ({ start: w.start, end: Math.max(w.end, w.start + 0.12), text: w.text.toUpperCase() }));
    const extra = await fontExtra();
    extra['words.srt'] = new TextEncoder().encode(toSrt(wordCues));
    const a = aliasOf(video, 0);
    const name = 'meme-captions.mp4';
    const bytes = await encodeVideo(
      ctx,
      ['-i', a, '-vf', `subtitles=words.srt:fontsdir=.:force_style='${STYLES[parsed.style]}'`, ...mp4Tail(), name],
      [{ name: a, data: await video.bytes() }],
      name,
      extra,
    );
    const out = fileFromOutput(name, bytes);
    return wrap('creator-meme-captions', files, [out], parsed, { words: words.length, duration: (await probe(out, ctx)).duration });
  },
});
