import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { buildBleepList } from '../transcript/bleep.js';
import { SPEECH_LICENSES, TRANSCRIPT_ACCEPT } from '../licenses.js';
import { loadTranscript, provenanceReport, stem, textFile } from './common.js';

const options = z.object({
  kind: z.enum(['bleep', 'skip']).default('bleep'),
  languages: z.enum(['de', 'en', 'both']).default('both'),
  extra: z.string().default(''),
});

export const audioProfanityBleepList = defineTool({
  id: 'audio-profanity-bleep-list',
  pack: 'speech',
  category: 'speech',
  title: { de: 'Schimpfwort-Zeiten', en: 'Profanity timestamps' },
  description: {
    de: 'Aus Transkript + Wortliste Zeitstempel für audio-bleep (Media-Pack). Kindersicherung = Skip-Liste.',
    en: 'From transcript + word list, timestamps for audio-bleep (media pack). Kids mode = skip list.',
  },
  inputs: { accept: TRANSCRIPT_ACCEPT, multiple: false, min: 1 },
  outputs: { mime: ['application/json', 'text/csv'] },
  options,
  licenses: SPEECH_LICENSES,
  seo: { keywords: ['schimpfwort', 'bleep', 'kindersicherung'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const file = files[0];
    if (!file) throw new Error('Kein Transkript.');
    const t = await loadTranscript(file);
    const langs = parsed.languages === 'both' ? (['de', 'en'] as const) : ([parsed.languages] as Array<'de' | 'en'>);
    const extra = parsed.extra.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    const list = buildBleepList(t, extra, [...langs], parsed.kind);
    const csv = ['start,end,word', ...list.hits.map((h) => `${h.start},${h.end},"${h.word.replace(/"/g, '""')}"`)].join('\n') + '\n';
    const base = stem(file.name);
    return {
      outputs: [
        textFile(`${base}-bleep.json`, `${JSON.stringify(list, null, 2)}\n`, 'application/json'),
        textFile(`${base}-bleep.csv`, csv, 'text/csv'),
      ],
      warnings: [],
      report: await provenanceReport('audio-profanity-bleep-list', parsed, files, {
        list,
        audioBleep: 'Media-Pack audio-bleep / video-swear-beep konsumiert hits[{start,end}]',
      }),
    };
  },
});
