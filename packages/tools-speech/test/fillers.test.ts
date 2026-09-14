import { describe, expect, it } from 'vitest';
import { buildCutlist } from '../src/transcript/edits.js';
import type { Transcript } from '../src/captions/types.js';

const t: Transcript = {
  language: 'de',
  segments: [
    {
      start: 0,
      end: 6,
      text: 'Äh also hallo äh äh äh Freunde',
      words: [
        { start: 0, end: 0.3, text: 'Äh' },
        { start: 0.3, end: 0.6, text: 'also' },
        { start: 0.6, end: 1.0, text: 'hallo' },
        { start: 3.2, end: 3.4, text: 'äh' },
        { start: 3.4, end: 3.6, text: 'äh' },
        { start: 3.6, end: 3.8, text: 'äh' },
        { start: 3.8, end: 4.5, text: 'Freunde' },
      ],
    },
  ],
};

describe('filler → cutlist', () => {
  it('removes fillers, pauses and repeats and keeps speech', () => {
    const cut = buildCutlist(t, { languages: ['de', 'en'], extra: [], pauseSec: 1.5, clusterSec: 0.9 });
    expect(cut.remove.some((h) => h.kind === 'filler')).toBe(true);
    expect(cut.remove.some((h) => h.kind === 'pause')).toBe(true);
    expect(cut.remove.some((h) => h.kind === 'repeat')).toBe(true);
    expect(cut.keep.length).toBeGreaterThan(0);
    expect(cut.keep.some(([a, b]) => a <= 0.6 && b >= 1.0)).toBe(true);
  });
});
