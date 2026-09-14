import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { chaptersFromEmbeddings, sentencesFromTranscript, writeFfmetadata, writeYoutubeChapters } from '../transcript/chapters.js';
import { openPipeline } from '../whisper/transformers.js';
import { SPEECH_LICENSES, TRANSCRIPT_ACCEPT } from '../licenses.js';
import { loadTranscript, provenanceReport, stem, textFile } from './common.js';

const options = z.object({
  minGapSentences: z.coerce.number().min(1).max(20).default(3),
  confirmModelDownload: z.boolean().default(false),
});

export const transcriptChapters = defineTool({
  id: 'transcript-chapters',
  pack: 'speech',
  category: 'speech',
  title: { de: 'Kapitel aus Transkript', en: 'Chapters from transcript' },
  description: {
    de: 'Themenwechsel via Satz-Embeddings (MiniLM), Titel per TextRank-light. YouTube-Kapitel, JSON, ffmetadata.',
    en: 'Topic shifts via sentence embeddings (MiniLM), titles via TextRank-light. YouTube chapters, JSON, ffmetadata.',
  },
  inputs: { accept: TRANSCRIPT_ACCEPT, multiple: false, min: 1 },
  outputs: { mime: ['text/plain', 'application/json'] },
  options,
  licenses: SPEECH_LICENSES,
  seo: { keywords: ['youtube kapitel', 'auto chapters', 'ffmetadata'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const file = files[0];
    if (!file) throw new Error('Kein Transkript.');
    const t = await loadTranscript(file);
    const sentences = sentencesFromTranscript(t);
    const { pipe } = await openPipeline(
      'minilm-l6-v2',
      'feature-extraction',
      ctx.platform,
      ctx,
      parsed.confirmModelDownload,
    );
    const embeddings: number[][] = [];
    for (let i = 0; i < sentences.length; i++) {
      ctx.progress(i / Math.max(1, sentences.length), `Embedding ${i + 1}`);
      const raw = await pipe(sentences[i]!.text, { pooling: 'mean', normalize: true });
      embeddings.push(flattenEmbedding(raw));
    }
    const chapters = chaptersFromEmbeddings(sentences, embeddings, parsed.minGapSentences);
    const base = stem(file.name);
    return {
      outputs: [
        textFile(`${base}-youtube.txt`, writeYoutubeChapters(chapters), 'text/plain'),
        textFile(`${base}-chapters.json`, `${JSON.stringify(chapters, null, 2)}\n`, 'application/json'),
        textFile(`${base}.ffmeta`, writeFfmetadata(chapters), 'text/plain'),
      ],
      warnings: [],
      report: await provenanceReport('transcript-chapters', parsed, files, { chapters }),
    };
  },
});

function flattenEmbedding(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (Array.isArray(first)) return (first as number[]).map(Number);
    return (raw as number[]).map(Number);
  }
  if (raw && typeof raw === 'object' && 'data' in raw) {
    return Array.from((raw as { data: ArrayLike<number> }).data);
  }
  return [];
}
