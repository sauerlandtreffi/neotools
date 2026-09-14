import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { mergeBilingual } from '../captions/bilingual.js';
import { writeCaptions, MIME_FOR, EXT_FOR } from '../captions/write.js';
import { SPEECH_LICENSES, SUBTITLE_ACCEPT } from '../licenses.js';
import { loadCaptionDoc, provenanceReport, stem, textFile } from './common.js';

const options = z.object({
  output: z.enum(['srt', 'ass', 'vtt']).default('srt'),
  gap: z.coerce.number().min(0).max(5).default(0.35),
});

export const subtitlesBilingual = defineTool({
  id: 'subtitles-bilingual',
  pack: 'speech',
  category: 'speech',
  title: { de: 'Zweisprachige Untertitel', en: 'Bilingual subtitles' },
  description: {
    de: 'Zwei Untertiteldateien per Zeitalignment zu einer zweisprachigen SRT/ASS mergen.',
    en: 'Merge two subtitle files into one bilingual SRT/ASS via time alignment.',
  },
  inputs: { accept: SUBTITLE_ACCEPT, multiple: true, min: 2 },
  outputs: { mime: ['application/x-subrip', 'text/plain'] },
  options,
  licenses: SPEECH_LICENSES,
  seo: { keywords: ['zweisprachig', 'bilingual srt'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    if (files.length < 2) throw new Error('Zwei Untertiteldateien nötig.');
    ctx.progress(0.2, files[0]!.name);
    const a = await loadCaptionDoc(files[0]!);
    const b = await loadCaptionDoc(files[1]!);
    const cues = mergeBilingual(a.cues, b.cues, parsed.gap);
    return {
      outputs: [
        textFile(`${stem(files[0]!.name)}-bilingual.${EXT_FOR[parsed.output]}`, writeCaptions(cues, parsed.output), MIME_FOR[parsed.output]),
      ],
      warnings: [],
      report: await provenanceReport('subtitles-bilingual', parsed, files, { cues: cues.length }),
    };
  },
});
