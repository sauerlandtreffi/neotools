import type { AudioSource } from '../audio/types.js';
import type { Transcript, TranscriptSegment } from '../captions/types.js';
import { agglomerativeCluster, autoK } from './cluster.js';
import { mfccMean } from './mfcc.js';

export interface DiarizeOptions {
  pauseSec: number;
  maxSpeakers: number;
  usePyannote: boolean;
}

export const DEFAULT_DIARIZE: DiarizeOptions = {
  pauseSec: 0.8,
  maxSpeakers: 6,
  usePyannote: false,
};

export function sliceSamples(src: AudioSource, start: number, end: number): Float32Array {
  const a = Math.max(0, Math.floor(start * src.sampleRate));
  const b = Math.min(src.samples.length, Math.ceil(end * src.sampleRate));
  return src.samples.subarray(a, Math.max(a + 1, b));
}

export function diarizeHeuristic(
  transcript: Transcript,
  audio: AudioSource,
  opts: Partial<DiarizeOptions> = {},
): Transcript {
  const o = { ...DEFAULT_DIARIZE, ...opts };
  const segs = transcript.segments;
  if (!segs.length) return transcript;
  const embeddings: Float64Array[] = segs.map((s) => mfccMean(sliceSamples(audio, s.start, s.end), audio.sampleRate));
  const pauseBreaks = new Set<number>();
  for (let i = 1; i < segs.length; i++) {
    if ((segs[i]!.start - segs[i - 1]!.end) >= o.pauseSec) pauseBreaks.add(i);
  }
  const k = Math.min(o.maxSpeakers, Math.max(1, autoK(embeddings, o.maxSpeakers)));
  const labels = agglomerativeCluster(embeddings, k);
  const out: TranscriptSegment[] = segs.map((s, i) => ({
    ...s,
    speaker: `SPEAKER_${String(labels[i] ?? 0).padStart(2, '0')}`,
  }));
  // Pause-forced flip if clustering glued two sides of a long gap to the same speaker
  for (const i of pauseBreaks) {
    if (out[i] && out[i - 1] && out[i]!.speaker === out[i - 1]!.speaker && k > 1) {
      const alt = ((labels[i] ?? 0) + 1) % k;
      out[i] = { ...out[i]!, speaker: `SPEAKER_${String(alt).padStart(2, '0')}` };
    }
  }
  return { ...transcript, segments: out };
}

/** Test helper: cluster precomputed MFCC vectors. */
export function clusterSpeakerVectors(vectors: Array<ArrayLike<number>>, maxSpeakers = 6): string[] {
  const k = autoK(vectors, maxSpeakers);
  return agglomerativeCluster(vectors, k).map((i) => `SPEAKER_${String(i).padStart(2, '0')}`);
}
