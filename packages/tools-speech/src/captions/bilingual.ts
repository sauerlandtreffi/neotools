import type { Cue } from './types.js';

export function mergeBilingual(primary: Cue[], secondary: Cue[], gap = 0.35): Cue[] {
  return primary.map((a) => {
    const match = bestOverlap(a, secondary, gap);
    const text = match ? `${a.text}\n${match.text}` : a.text;
    return { ...a, text };
  });
}

function bestOverlap(cue: Cue, others: Cue[], gap: number): Cue | undefined {
  let best: Cue | undefined;
  let bestScore = -1;
  for (const b of others) {
    const overlap = Math.min(cue.end, b.end) - Math.max(cue.start, b.start);
    const mid = Math.abs((cue.start + cue.end) / 2 - (b.start + b.end) / 2);
    const score = overlap > 0 ? overlap : -mid;
    if (score > bestScore && (overlap > 0 || mid <= gap + (cue.end - cue.start))) {
      bestScore = score;
      best = b;
    }
  }
  return best;
}
