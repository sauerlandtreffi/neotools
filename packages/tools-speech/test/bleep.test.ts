import { describe, expect, it } from 'vitest';
import { buildBleepList } from '../src/transcript/bleep.js';

describe('bleep list', () => {
  it('flags profanity timestamps and kids skip list', () => {
    const t = {
      language: 'de',
      segments: [
        {
          start: 0,
          end: 2,
          text: 'Das ist Scheiße mist',
          words: [
            { start: 0, end: 0.4, text: 'Das' },
            { start: 0.4, end: 0.6, text: 'ist' },
            { start: 0.6, end: 1.1, text: 'Scheiße' },
            { start: 1.1, end: 1.5, text: 'mist' },
          ],
        },
      ],
    };
    const bleep = buildBleepList(t, [], ['de'], 'bleep');
    expect(bleep.hits.map((h) => h.word.toLowerCase())).toEqual(expect.arrayContaining(['scheiße', 'mist']));
    const kids = buildBleepList(t, ['nackt'], ['de'], 'skip');
    expect(kids.kind).toBe('skip');
    expect(kids.hits.length).toBeGreaterThanOrEqual(bleep.hits.length);
  });
});
