import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { decodeAudio } from '../audio/decode.js';
import { DEFAULT_LAYOUT } from '../captions/types.js';
import { writeCaptions, writeJson, MIME_FOR, EXT_FOR } from '../captions/write.js';
import { transcriptToCues } from '../captions/types.js';
import { translateTexts, type MarianPair } from '../translate/marian.js';
import { transcribeWhisper } from '../whisper/transcribe.js';
import type { WhisperModelId } from '../whisper/types.js';
import { AUDIO_ACCEPT, SPEECH_LICENSES } from '../licenses.js';
import { parseFormatList, provenanceReport, stem, textFile } from './common.js';

const options = z.object({
  model: z
    .enum(['whisper-tiny', 'whisper-base', 'whisper-small', 'distil-whisper-small-en', 'whisper-large-v3-turbo'])
    .default('whisper-tiny'),
  language: z.string().default('auto'),
  task: z.enum(['transcribe', 'translate']).default('transcribe'),
  wordTimestamps: z.boolean().default(true),
  diarize: z.boolean().default(false),
  formats: z.string().default('srt,vtt,txt,json'),
  bilingual: z.boolean().default(false),
  bilingualPair: z.enum(['de-en', 'en-de', 'en-fr', 'fr-en', 'en-es', 'es-en', 'en-it', 'it-en']).default('de-en'),
  maxLineLength: z.coerce.number().min(12).max(80).default(42),
  maxLines: z.coerce.number().min(1).max(4).default(2),
  confirmModelDownload: z.boolean().default(false),
});

export const speechTranscribe = defineTool({
  id: 'speech-transcribe',
  pack: 'speech',
  category: 'speech',
  title: { de: 'Transkribieren (Whisper)', en: 'Transcribe (Whisper)' },
  description: {
    de: 'Audio/Video lokal mit Whisper (Transformers.js) transkribieren. SRT/VTT/TXT/JSON, Wort-Zeiten, Diarization-lite.',
    en: 'Transcribe audio/video locally with Whisper (Transformers.js). SRT/VTT/TXT/JSON, word timings, lite diarization.',
  },
  inputs: { accept: AUDIO_ACCEPT, multiple: false, min: 1 },
  outputs: { mime: ['application/x-subrip', 'text/vtt', 'text/plain', 'application/json'] },
  options,
  ui: { editor: 'transcript' },
  presets: [
    { id: 'tiny', title: { de: 'Tiny mehrsprachig', en: 'Tiny multilingual' }, options: { model: 'whisper-tiny' } },
    { id: 'subs', title: { de: 'Untertitel SRT+VTT', en: 'Subtitles SRT+VTT' }, options: { formats: 'srt,vtt', wordTimestamps: true } },
  ],
  licenses: SPEECH_LICENSES,
  seo: { keywords: ['whisper', 'transkribieren', 'untertitel', 'speech to text'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const file = files[0];
    if (!file) throw new Error('Keine Audiodatei.');
    ctx.progress(0.02, file.name);
    const audio = await decodeAudio(file, ctx);
    const transcript = await transcribeWhisper(audio, ctx, {
      model: parsed.model as WhisperModelId,
      language: parsed.language,
      task: parsed.task,
      wordTimestamps: parsed.wordTimestamps,
      diarize: parsed.diarize,
      confirmModelDownload: parsed.confirmModelDownload,
      chunkSec: 30,
      overlapSec: 5,
    });
    const layout = {
      ...DEFAULT_LAYOUT,
      maxLineLength: parsed.maxLineLength,
      maxLines: parsed.maxLines,
    };
    let cues = transcriptToCues(transcript);
    const formats = parseFormatList(parsed.formats);
    if (parsed.bilingual) {
      const texts = cues.map((c) => c.text);
      const translated = await translateTexts(
        texts,
        parsed.bilingualPair as MarianPair,
        ctx,
        parsed.confirmModelDownload,
      );
      cues = cues.map((c, i) => ({ ...c, text: `${c.text}\n${translated[i] ?? ''}` }));
    }
    const base = stem(file.name);
    const outputs = formats.map((f) => {
      const body = f === 'json' ? writeJson(cues, transcript.language) : writeCaptions(cues, f, { layout });
      return textFile(`${base}.${EXT_FOR[f]}`, body, MIME_FOR[f]);
    });
    return {
      outputs,
      warnings: [],
      report: await provenanceReport('speech-transcribe', parsed, files, {
        transcript,
        decoder: audio.format,
        sampleRate: audio.sampleRate,
        media: {
          extractAudio: 'optional @neotools/tools-media',
          videoCutlist: 'transcript-edits → video-cutlist',
          audioBleep: 'audio-profanity-bleep-list → audio-bleep',
        },
      }),
    };
  },
});
