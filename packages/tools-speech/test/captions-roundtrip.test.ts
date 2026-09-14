import { describe, expect, it } from 'vitest';
import { parseSrt, parseVtt, parseAss } from '../src/captions/parse.js';
import { writeAss, writeSrt, writeVtt } from '../src/captions/write.js';
import { decodeSubtitleBytes } from '../src/captions/encoding.js';

const SRT = `1
00:00:00,000 --> 00:00:02,500
Hallo Welt

2
00:00:01,800 --> 00:00:04,000
Überlappung

`;

const VTT = `WEBVTT

00:00:00.000 --> 00:00:02.500
Hello world

00:00:02.500 --> 00:00:04.000
Second
`;

const ASS = `[Script Info]
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:02.50,Default,,0,0,0,,Hallo\\NWelt
`;

describe('caption roundtrips', () => {
  it('SRT comma timestamps and overlap survive', () => {
    const cues = parseSrt(SRT);
    expect(cues).toHaveLength(2);
    expect(cues[0]?.start).toBe(0);
    expect(cues[0]?.end).toBe(2.5);
    expect(cues[1]?.start).toBeLessThan(cues[0]!.end);
    const back = parseSrt(writeSrt(cues));
    expect(back[0]?.text).toBe('Hallo Welt');
    expect(back[1]?.start).toBeCloseTo(1.8, 3);
  });

  it('VTT dot milliseconds roundtrip', () => {
    const cues = parseVtt(VTT);
    expect(cues[0]?.end).toBeCloseTo(2.5, 3);
    const again = parseVtt(writeVtt(cues));
    expect(again[1]?.text).toBe('Second');
  });

  it('ASS-light Dialogue lines', () => {
    const cues = parseAss(ASS);
    expect(cues[0]?.text).toBe('Hallo\nWelt');
    const out = writeAss(cues);
    expect(out).toContain('Dialogue:');
    expect(parseAss(out)[0]?.text).toContain('Hallo');
  });

  it('strips UTF-8 BOM', () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(SRT)]);
    const text = decodeSubtitleBytes(bom);
    expect(text.startsWith('1')).toBe(true);
    expect(parseSrt(text)).toHaveLength(2);
  });
});
