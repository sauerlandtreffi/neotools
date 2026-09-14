import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { convertCueFramerate, shiftCues, stretchCues } from '../captions/shift.js';
import type { FpsKey } from '../captions/time.js';
import { writeCaptions, MIME_FOR, EXT_FOR } from '../captions/write.js';
import { SPEECH_LICENSES, SUBTITLE_ACCEPT } from '../licenses.js';
import { loadCaptionDoc, provenanceReport, stem, textFile } from './common.js';

const options = z.object({
  mode: z.enum(['offset', 'stretch', 'framerate']).default('offset'),
  offsetSec: z.coerce.number().default(0),
  anchorA: z.coerce.number().default(0),
  anchorAPrime: z.coerce.number().default(0),
  anchorB: z.coerce.number().default(10),
  anchorBPrime: z.coerce.number().default(10),
  fromFps: z.enum(['23.976', '24', '25', '29.97', '30']).default('23.976'),
  toFps: z.enum(['23.976', '24', '25', '29.97', '30']).default('25'),
  output: z.enum(['srt', 'vtt', 'ass', 'json']).default('srt'),
});

export const subtitlesShift = defineTool({
  id: 'subtitles-shift',
  pack: 'speech',
  category: 'speech',
  title: { de: 'Untertitel verschieben', en: 'Shift subtitles' },
  description: {
    de: 'Offset, lineare Streckung über zwei Anker, Framerate 23.976↔25↔29.97.',
    en: 'Offset, linear stretch via two anchors, frame-rate 23.976↔25↔29.97.',
  },
  inputs: { accept: SUBTITLE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['application/x-subrip', 'text/vtt', 'text/plain', 'application/json'] },
  options,
  licenses: SPEECH_LICENSES,
  seo: { keywords: ['untertitel sync', 'srt shift', 'framerate'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const outputs = [];
    for (const [i, file] of files.entries()) {
      ctx.progress(i / files.length, file.name);
      const doc = await loadCaptionDoc(file);
      let cues = doc.cues;
      if (parsed.mode === 'offset') cues = shiftCues(cues, parsed.offsetSec);
      else if (parsed.mode === 'stretch') {
        cues = stretchCues(cues, parsed.anchorA, parsed.anchorAPrime, parsed.anchorB, parsed.anchorBPrime);
      } else cues = convertCueFramerate(cues, parsed.fromFps as FpsKey, parsed.toFps as FpsKey);
      outputs.push(
        textFile(`${stem(file.name)}-shifted.${EXT_FOR[parsed.output]}`, writeCaptions(cues, parsed.output), MIME_FOR[parsed.output]),
      );
    }
    return {
      outputs,
      warnings: [],
      report: await provenanceReport('subtitles-shift', parsed, files, {}),
    };
  },
});
