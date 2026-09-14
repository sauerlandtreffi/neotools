import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { DEFAULT_LAYOUT } from '../captions/types.js';
import { writeCaptions, MIME_FOR, EXT_FOR } from '../captions/write.js';
import type { CaptionFormat } from '../captions/types.js';
import { SPEECH_LICENSES, SUBTITLE_ACCEPT } from '../licenses.js';
import { loadCaptionDoc, parseFormatList, provenanceReport, stem, textFile } from './common.js';

const options = z.object({
  formats: z.string().default('srt,vtt'),
  maxLineLength: z.coerce.number().min(12).max(80).default(42),
  maxLines: z.coerce.number().min(1).max(4).default(2),
  reflow: z.boolean().default(true),
  maxCueDuration: z.coerce.number().min(1).max(30).default(7),
});

export const subtitlesConvert = defineTool({
  id: 'subtitles-convert',
  pack: 'speech',
  category: 'speech',
  title: { de: 'Untertitel konvertieren', en: 'Convert subtitles' },
  description: {
    de: 'SRT/VTT/ASS/SBV/TTML/LRC/JSON ineinander wandeln. Encoding-Erkennung, Zeilen-Reflow.',
    en: 'Convert SRT/VTT/ASS/SBV/TTML/LRC/JSON. Encoding detection, line reflow.',
  },
  inputs: { accept: SUBTITLE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['application/x-subrip', 'text/vtt', 'text/plain', 'application/json'] },
  options,
  licenses: SPEECH_LICENSES,
  seo: { keywords: ['srt', 'vtt', 'untertitel', 'konvertieren'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const formats = parseFormatList(parsed.formats);
    const layout = {
      ...DEFAULT_LAYOUT,
      maxLineLength: parsed.maxLineLength,
      maxLines: parsed.maxLines,
      maxCueDuration: parsed.maxCueDuration,
    };
    const outputs = [];
    for (const [i, file] of files.entries()) {
      ctx.progress(i / files.length, file.name);
      const doc = await loadCaptionDoc(file);
      const base = stem(file.name);
      for (const f of formats) {
        outputs.push(
          textFile(
            `${base}.${EXT_FOR[f as CaptionFormat]}`,
            writeCaptions(doc.cues, f, { layout: parsed.reflow ? layout : undefined }),
            MIME_FOR[f],
          ),
        );
      }
    }
    return {
      outputs,
      warnings: [],
      report: await provenanceReport('subtitles-convert', parsed, files, { formats }),
    };
  },
});
