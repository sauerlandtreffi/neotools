import { applyOffset, convertFramerate, mapCueTimes, stretchTime, type FpsKey } from './time.js';
import type { Cue } from './types.js';

export function shiftCues(cues: Cue[], offsetSec: number): Cue[] {
  return cues.map((c) => {
    const t = mapCueTimes(c.start, c.end, (x) => applyOffset(x, offsetSec));
    return remapWords({ ...c, ...t }, (x) => applyOffset(x, offsetSec));
  });
}

export function stretchCues(cues: Cue[], a: number, aPrime: number, b: number, bPrime: number): Cue[] {
  const map = (t: number) => stretchTime(t, a, aPrime, b, bPrime);
  return cues.map((c) => {
    const t = mapCueTimes(c.start, c.end, map);
    return remapWords({ ...c, ...t }, map);
  });
}

export function convertCueFramerate(cues: Cue[], from: FpsKey, to: FpsKey): Cue[] {
  const map = (t: number) => convertFramerate(t, from, to);
  return cues.map((c) => {
    const t = mapCueTimes(c.start, c.end, map);
    return remapWords({ ...c, ...t }, map);
  });
}

function remapWords(cue: Cue, map: (t: number) => number): Cue {
  if (!cue.words?.length) return cue;
  return {
    ...cue,
    words: cue.words.map((w) => ({
      ...w,
      start: Math.max(0, map(w.start)),
      end: Math.max(0, map(w.end)),
    })),
  };
}
