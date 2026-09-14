import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { decodeAudio } from '../audio/decode.js';
import { rmsCurve, snapCues } from '../captions/snap.js';
import { writeCaptions, MIME_FOR, EXT_FOR } from '../captions/write.js';
import { SPEECH_LICENSES, SUBTITLE_ACCEPT } from '../licenses.js';
import { loadCaptionDoc, pickAudioFiles, provenanceReport, stem, textFile } from './common.js';

const options = z.object({
  silenceThreshold: z.coerce.number().min(0).max(1).default(0.02),
  minDuration: z.coerce.number().min(0.1).max(10).default(0.8),
  maxDuration: z.coerce.number().min(1).max(20).default(7),
  maxCps: z.coerce.number().min(8).max(40).default(21),
  output: z.enum(['srt', 'vtt', 'ass']).default('srt'),
});

export const subtitlesSnap = defineTool({
  id: 'subtitles-snap',
  pack: 'speech',
  category: 'speech',
  title: { de: 'Untertitel an Lücken snappen', en: 'Snap subtitles to gaps' },
  description: {
    de: 'Cues an Sprachlücken (RMS) snappen, Mindest-/Maximaldauer und Lesegeschwindigkeit (CPS) erzwingen.',
    en: 'Snap cues to speech gaps (RMS), enforce min/max duration and reading speed (CPS).',
  },
  inputs: { accept: [...SUBTITLE_ACCEPT, 'audio/wav', 'audio/mpeg', '.wav', '.mp3'], multiple: true, min: 1 },
  outputs: { mime: ['application/x-subrip', 'text/vtt'] },
  options,
  licenses: SPEECH_LICENSES,
  seo: { keywords: ['untertitel snap', 'cps', 'silencedetect'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const subs = files.filter((f) => /\.(srt|vtt|ass|ssa|sbv|ttml|lrc|json)$/i.test(f.name));
    const audioFile = pickAudioFiles(files)[0];
    if (!audioFile) throw new Error('Audio für RMS-Analyse fehlt.');
    const audio = await decodeAudio(audioFile, ctx);
    const curve = rmsCurve(audio.samples, audio.sampleRate);
    const outputs = [];
    for (const [i, file] of (subs.length ? subs : files).entries()) {
      ctx.progress(i / Math.max(1, files.length), file.name);
      const doc = await loadCaptionDoc(file);
      const cues = snapCues(doc.cues, curve, parsed);
      outputs.push(
        textFile(`${stem(file.name)}-snap.${EXT_FOR[parsed.output]}`, writeCaptions(cues, parsed.output), MIME_FOR[parsed.output]),
      );
    }
    return {
      outputs,
      warnings: [],
      report: await provenanceReport('subtitles-snap', parsed, files, { frames: curve.values.length }),
    };
  },
});
