import type { Cue } from './types.js';

export interface RmsCurve {
  /** RMS energy per frame. */
  values: Float32Array;
  /** Seconds per frame. */
  hopSec: number;
}

export interface SnapOptions {
  silenceThreshold: number;
  minDuration: number;
  maxDuration: number;
  maxCps: number;
  padSec: number;
}

export const DEFAULT_SNAP: SnapOptions = {
  silenceThreshold: 0.02,
  minDuration: 0.8,
  maxDuration: 7,
  maxCps: 21,
  padSec: 0.04,
};

export function rmsCurve(samples: Float32Array, sampleRate: number, winSec = 0.02): RmsCurve {
  const hop = Math.max(1, Math.round(sampleRate * winSec));
  const n = Math.ceil(samples.length / hop);
  const values = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    const start = i * hop;
    const end = Math.min(samples.length, start + hop);
    for (let j = start; j < end; j++) acc += samples[j]! * samples[j]!;
    values[i] = Math.sqrt(acc / Math.max(1, end - start));
  }
  return { values, hopSec: hop / sampleRate };
}

export function silenceMask(curve: RmsCurve, threshold: number): boolean[] {
  return [...curve.values].map((v) => v < threshold);
}

/** Nearest silence-to-speech (or speech-to-silence) edge around `t`. */
export function nearestGapEdge(curve: RmsCurve, t: number, threshold: number, prefer: 'start' | 'end'): number {
  const mask = silenceMask(curve, threshold);
  const idx = Math.max(0, Math.min(mask.length - 1, Math.round(t / curve.hopSec)));
  const isSilence = (i: number) => Boolean(mask[i]);
  if (prefer === 'start') {
    for (let d = 0; d < mask.length; d++) {
      const a = idx - d;
      const b = idx + d;
      if (a >= 1 && isSilence(a - 1) && !isSilence(a)) return a * curve.hopSec;
      if (b >= 1 && b < mask.length && isSilence(b - 1) && !isSilence(b)) return b * curve.hopSec;
    }
  } else {
    for (let d = 0; d < mask.length; d++) {
      const a = idx - d;
      const b = idx + d;
      if (a >= 0 && a + 1 < mask.length && !isSilence(a) && isSilence(a + 1)) return (a + 1) * curve.hopSec;
      if (b >= 0 && b + 1 < mask.length && !isSilence(b) && isSilence(b + 1)) return (b + 1) * curve.hopSec;
    }
  }
  return t;
}

export function snapCues(cues: Cue[], curve: RmsCurve, opts: Partial<SnapOptions> = {}): Cue[] {
  const o = { ...DEFAULT_SNAP, ...opts };
  return cues.map((cue) => {
    let start = nearestGapEdge(curve, cue.start, o.silenceThreshold, 'start') + o.padSec;
    let end = nearestGapEdge(curve, cue.end, o.silenceThreshold, 'end') - o.padSec;
    start = Math.max(0, start);
    if (end <= start) end = start + o.minDuration;
    const chars = cue.text.replace(/\s+/g, '').length;
    let dur = end - start;
    if (chars > 0 && dur > 0 && chars / dur > o.maxCps) {
      end = start + chars / o.maxCps;
      dur = end - start;
    }
    if (dur < o.minDuration) end = start + o.minDuration;
    if (end - start > o.maxDuration) end = start + o.maxDuration;
    return { ...cue, start, end };
  });
}

export function cps(cue: Cue): number {
  const chars = cue.text.replace(/\s+/g, '').length;
  const dur = Math.max(0.001, cue.end - cue.start);
  return chars / dur;
}
