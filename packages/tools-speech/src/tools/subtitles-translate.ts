import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { writeCaptions, MIME_FOR, EXT_FOR } from '../captions/write.js';
import type { MarianPair } from '../translate/marian.js';
import { parseTerminologyCsv, translateTexts } from '../translate/marian.js';
import { SPEECH_LICENSES, SUBTITLE_ACCEPT } from '../licenses.js';
import { loadCaptionDoc, provenanceReport, stem, textFile } from './common.js';

const options = z.object({
  pair: z.enum(['de-en', 'en-de', 'en-fr', 'fr-en', 'en-es', 'es-en', 'en-it', 'it-en']).default('de-en'),
  bilingual: z.boolean().default(true),
  output: z.enum(['srt', 'vtt', 'ass', 'json']).default('srt'),
  confirmModelDownload: z.boolean().default(false),
});

export const subtitlesTranslate = defineTool({
  id: 'subtitles-translate',
  pack: 'speech',
  category: 'speech',
  title: { de: 'Untertitel übersetzen', en: 'Translate subtitles' },
  description: {
    de: 'Lokale Marian-Übersetzung de↔en und en↔fr/es/it. Zweisprachige Ausgabe, Terminologie-CSV.',
    en: 'Local Marian translation de↔en and en↔fr/es/it. Bilingual output, terminology CSV.',
  },
  inputs: { accept: [...SUBTITLE_ACCEPT, 'text/csv', '.csv'], multiple: true, min: 1 },
  outputs: { mime: ['application/x-subrip', 'text/vtt', 'application/json'] },
  options,
  licenses: SPEECH_LICENSES,
  seo: { keywords: ['untertitel übersetzen', 'marian', 'opus-mt'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const termFile = files.find((f) => f.name.toLowerCase().endsWith('.csv'));
    const terminology = termFile ? parseTerminologyCsv(new TextDecoder().decode(await termFile.bytes())) : undefined;
    const subs = files.filter((f) => f !== termFile);
    const outputs = [];
    for (const [i, file] of subs.entries()) {
      ctx.progress(i / Math.max(1, subs.length), file.name);
      const doc = await loadCaptionDoc(file);
      const translated = await translateTexts(
        doc.cues.map((c) => c.text),
        parsed.pair as MarianPair,
        ctx,
        parsed.confirmModelDownload,
        terminology,
      );
      const cues = doc.cues.map((c, idx) => ({
        ...c,
        text: parsed.bilingual ? `${c.text}\n${translated[idx] ?? ''}` : (translated[idx] ?? c.text),
      }));
      outputs.push(
        textFile(`${stem(file.name)}-${parsed.pair}.${EXT_FOR[parsed.output]}`, writeCaptions(cues, parsed.output), MIME_FOR[parsed.output]),
      );
    }
    return {
      outputs,
      warnings: [],
      report: await provenanceReport('subtitles-translate', parsed, files, { pair: parsed.pair }),
    };
  },
});
