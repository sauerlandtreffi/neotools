import type { Transcript } from '../captions/types.js';
import { cosineDistance, distancePeaks, splitSentences } from './embeddings.js';
export { titleFromText } from './textrank.js';
import { titleFromText } from './textrank.js';

export interface Chapter {
  start: number;
  end: number;
  title: string;
  text: string;
}

export interface SentenceSpan {
  start: number;
  end: number;
  text: string;
}

export function sentencesFromTranscript(t: Transcript): SentenceSpan[] {
  const out: SentenceSpan[] = [];
  for (const seg of t.segments) {
    const parts = splitSentences(seg.text);
    if (!parts.length) continue;
    const dur = Math.max(0.01, seg.end - seg.start);
    let cursor = seg.start;
    const step = dur / parts.length;
    for (const p of parts) {
      out.push({ start: cursor, end: cursor + step, text: p });
      cursor += step;
    }
  }
  return out;
}

export function chaptersFromEmbeddings(
  sentences: SentenceSpan[],
  embeddings: Array<ArrayLike<number>>,
  minGap = 3,
): Chapter[] {
  const n = Math.min(sentences.length, embeddings.length);
  if (n === 0) return [];
  const distances: number[] = [];
  for (let i = 0; i < n - 1; i++) distances.push(cosineDistance(embeddings[i]!, embeddings[i + 1]!));
  const peaks = distancePeaks(distances, minGap);
  const cuts = [0, ...peaks.map((p) => p.index + 1), n];
  const unique = [...new Set(cuts)].sort((a, b) => a - b);
  const chapters: Chapter[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    const a = unique[i]!;
    const b = unique[i + 1]!;
    const slice = sentences.slice(a, b);
    if (!slice.length) continue;
    const text = slice.map((s) => s.text).join(' ');
    chapters.push({
      start: slice[0]!.start,
      end: slice[slice.length - 1]!.end,
      title: titleFromText(text),
      text,
    });
  }
  return chapters;
}

export function writeYoutubeChapters(chapters: Chapter[]): string {
  return chapters
    .map((c) => `${fmtYt(c.start)} ${c.title}`)
    .join('\n')
    .concat(chapters.length ? '\n' : '');
}

export function writeFfmetadata(chapters: Chapter[]): string {
  const lines = [';FFMETADATA1'];
  for (const c of chapters) {
    lines.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(c.start * 1000)}`, `END=${Math.round(c.end * 1000)}`, `title=${c.title}`);
  }
  return `${lines.join('\n')}\n`;
}

function fmtYt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}
