import type { AudioSource } from '../audio/types.js';

export interface AudioChunk {
  index: number;
  start: number;
  samples: Float32Array;
}

export function chunkAudio(src: AudioSource, windowSec = 30, overlapSec = 5): AudioChunk[] {
  const hop = Math.max(0.5, windowSec - overlapSec);
  const win = Math.max(1, Math.round(windowSec * src.sampleRate));
  const hopN = Math.max(1, Math.round(hop * src.sampleRate));
  const out: AudioChunk[] = [];
  let i = 0;
  let idx = 0;
  while (i < src.samples.length) {
    const slice = src.samples.subarray(i, Math.min(src.samples.length, i + win));
    out.push({ index: idx, start: i / src.sampleRate, samples: slice });
    idx += 1;
    if (i + win >= src.samples.length) break;
    i += hopN;
  }
  return out.length ? out : [{ index: 0, start: 0, samples: src.samples }];
}

export function mergeChunkSegments<T extends { start: number; end: number; text: string }>(
  pieces: Array<{ offset: number; segments: T[] }>,
  overlapSec: number,
): T[] {
  const merged: T[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const { offset, segments } = pieces[i]!;
    const cutoff = i === 0 ? -Infinity : offset + overlapSec / 2;
    for (const seg of segments) {
      const start = seg.start + offset;
      const end = seg.end + offset;
      if (start < cutoff && i > 0) continue;
      merged.push({ ...seg, start, end, text: seg.text });
    }
  }
  merged.sort((a, b) => a.start - b.start);
  return merged;
}
