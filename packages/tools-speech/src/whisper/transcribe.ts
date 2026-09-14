import { throwIfAborted, type ToolContext } from '@neotools/engine';
import type { AudioSource } from '../audio/types.js';
import type { Transcript, TranscriptSegment, TranscriptWord } from '../captions/types.js';
import { chunkAudio, mergeChunkSegments } from './chunk.js';
import { diarizeHeuristic } from './diarize.js';
import { openPipeline } from './transformers.js';
import type { WhisperOptions } from './types.js';

interface RawChunk {
  timestamp?: [number | null, number | null];
  text?: string;
  start?: number;
  end?: number;
}

export async function transcribeWhisper(
  audio: AudioSource,
  ctx: ToolContext,
  opts: WhisperOptions,
): Promise<Transcript> {
  const chunks = chunkAudio(audio, opts.chunkSec, opts.overlapSec);
  const { pipe } = await openPipeline(opts.model, 'automatic-speech-recognition', ctx.platform, ctx, opts.confirmModelDownload);

  const pieces: Array<{ offset: number; segments: TranscriptSegment[] }> = [];
  for (let i = 0; i < chunks.length; i++) {
    throwIfAborted(ctx.signal);
    ctx.progress(0.1 + (i / chunks.length) * 0.75, `Chunk ${i + 1}/${chunks.length}`);
    const ch = chunks[i]!;
    const callOpts: Record<string, unknown> = {
      sampling_rate: audio.sampleRate,
      return_timestamps: opts.wordTimestamps ? 'word' : true,
    };
    if (opts.language && opts.language !== 'auto') callOpts.language = opts.language;
    if (opts.task === 'translate') callOpts.task = 'translate';
    let raw: unknown;
    try {
      raw = await pipe(ch.samples, callOpts);
    } catch {
      raw = await pipe({ array: ch.samples, sampling_rate: audio.sampleRate }, callOpts);
    }
    pieces.push({ offset: ch.start, segments: normalizeAsr(raw, opts.wordTimestamps) });
  }

  const segments = mergeChunkSegments(pieces, opts.overlapSec);
  let transcript: Transcript = {
    language: opts.task === 'translate' ? 'en' : opts.language === 'auto' ? guessLang(segments) : opts.language,
    segments,
  };
  if (opts.diarize) {
    ctx.progress(0.9, 'Diarization');
    transcript = diarizeHeuristic(transcript, audio);
  }
  ctx.progress(0.98, 'Transkript fertig');
  return transcript;
}

export function normalizeAsr(raw: unknown, wordTs: boolean): TranscriptSegment[] {
  if (!raw || typeof raw !== 'object') return [];
  const rec = raw as { text?: string; chunks?: RawChunk[]; language?: string };
  const chunks = rec.chunks ?? [];
  if (!chunks.length) {
    const text = String(rec.text ?? '').trim();
    return text ? [{ start: 0, end: 0, text }] : [];
  }
  if (wordTs && looksLikeWords(chunks)) {
    return packWords(chunks);
  }
  return chunks.map((c) => ({
    start: num(c.timestamp?.[0] ?? c.start),
    end: num(c.timestamp?.[1] ?? c.end),
    text: String(c.text ?? '').trim(),
  }));
}

function looksLikeWords(chunks: RawChunk[]): boolean {
  const texts = chunks.map((c) => String(c.text ?? '').trim()).filter(Boolean);
  if (texts.length < 3) return false;
  const avg = texts.reduce((a, b) => a + b.length, 0) / texts.length;
  return avg <= 18;
}

function packWords(chunks: RawChunk[]): TranscriptSegment[] {
  const words: TranscriptWord[] = chunks.map((c) => ({
    start: num(c.timestamp?.[0] ?? c.start),
    end: num(c.timestamp?.[1] ?? c.end),
    text: String(c.text ?? '').trim(),
  }));
  const segs: TranscriptSegment[] = [];
  let buf: TranscriptWord[] = [];
  const flush = () => {
    if (!buf.length) return;
    segs.push({
      start: buf[0]!.start,
      end: buf[buf.length - 1]!.end,
      text: buf.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim(),
      words: buf,
    });
    buf = [];
  };
  for (const w of words) {
    buf.push(w);
    const dur = (buf[buf.length - 1]!.end - buf[0]!.start);
    const text = buf.map((x) => x.text).join(' ');
    if (dur >= 5.5 || text.length >= 80 || /[.!?…]$/.test(w.text)) flush();
  }
  flush();
  return segs;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function guessLang(segments: TranscriptSegment[]): string {
  const t = segments.map((s) => s.text).join(' ');
  if (/[äöüß]/i.test(t)) return 'de';
  if (/[àâçéèêëîïôùû]/i.test(t)) return 'fr';
  if (/[ñáíóú]/i.test(t)) return 'es';
  return 'en';
}
