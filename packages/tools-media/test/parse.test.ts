import { describe, expect, it } from 'vitest';
import { parseFfmpegLog } from '../src/ffmpeg/parse-probe.js';
import { parseProgressLine, ratioFromTime } from '../src/ffmpeg/progress.js';
import { parseCropdetect, parseDetectLog, parseLoudnorm, parseCueSheet } from '../src/ffmpeg/parse-filters.js';
import { atempoChain } from '../src/names.js';
import * as A from '../src/presets/args.js';
import type { ProbeResult } from '../src/ffmpeg/types.js';
import { BACKLOG_PRESET_IDS } from '../src/presets/args.js';

const probe: ProbeResult = {
  container: 'mov',
  duration: 2,
  streams: [{ index: 0, type: 'video', codec: 'mpeg4', width: 320, height: 240, fps: 25 }],
  hdr: false,
  chapters: [],
  attachments: [],
};

const io = { inputs: ['in0.mp4'], output: 'out.mp4' };

describe('parsers', () => {
  it('parses ffmpeg -i logs', () => {
    const log = `
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'a.mp4':
  Duration: 00:00:02.00, start: 0.000000, bitrate: 245 kb/s
  Stream #0:0(und): Video: mpeg4 (Simple Profile) (mp4v / 0x7634706D), yuv420p, 320x240, 200 kb/s, 25 fps, 25 tbr
  Stream #0:1(eng): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 69 kb/s
`;
    const p = parseFfmpegLog(log);
    expect(p.container).toContain('mov');
    expect(p.duration).toBeCloseTo(2, 1);
    expect(p.streams[0]?.width).toBe(320);
    expect(p.streams[1]?.sampleRate).toBe(44100);
    expect(p.streams[1]?.channels).toBe(2);
  });

  it('parses progress and cropdetect / loudnorm / detect', () => {
    expect(parseProgressLine('out_time_ms=1000000').outTimeSec).toBeCloseTo(1);
    expect(ratioFromTime(1, 2)).toBeCloseTo(0.5);
    expect(parseCropdetect('crop=320:200:0:20 other crop=300:180:10:30')).toBe('300:180:10:30');
    const ln = parseLoudnorm('junk\n{\n\t"input_i" : "-18.02",\n\t"output_i" : "-16.01"\n}\n');
    expect(ln?.input_i).toBeCloseTo(-18.02);
    const det = parseDetectLog('pts_time:0.4 pts_time:1.2 black_start:0.1 black_end:0.3 freeze_start: 1.0', 2);
    expect(det.scenes).toHaveLength(2);
    expect(det.black[0]?.start).toBeCloseTo(0.1);
    expect(det.epilepsy.flashesPerSecond).toBeGreaterThan(0);
  });

  it('parses CUE sheets', () => {
    const tracks = parseCueSheet(`TITLE "Album"\nTRACK 01 AUDIO\n  TITLE "A"\n  INDEX 01 00:00:00\nTRACK 02 AUDIO\n  TITLE "B"\n  INDEX 01 01:00:00\n`);
    expect(tracks).toHaveLength(2);
    expect(tracks[1]?.start).toBe(60);
  });

  it('builds atempo chains without chipmunk single-step >2', () => {
    expect(atempoChain(4)).toContain('atempo=2.0');
    expect(atempoChain(0.25)).toContain('atempo=0.5');
  });
});

describe('preset argument snapshots', () => {
  it('matches stable ffmpeg argv for core presets', () => {
    expect(A.videoMuteArgs({}, probe, io)).toMatchInlineSnapshot(`
      [
        "-i",
        "in0.mp4",
        "-c:v",
        "copy",
        "-an",
        "out.mp4",
      ]
    `);
    expect(A.videoTrimArgs({ startSec: 0.2, endSec: 1.1, copy: true }, probe, io)).toMatchInlineSnapshot(`
      [
        "-ss",
        "0.2",
        "-i",
        "in0.mp4",
        "-to",
        "1.1",
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
        "out.mp4",
      ]
    `);
    expect(A.videoGifArgs({ fps: 10, width: 240 }, probe, { inputs: ['in0.mp4'], output: 'out.gif' })).toMatchInlineSnapshot(`
      [
        "-i",
        "in0.mp4",
        "-vf",
        "fps=10,scale=240:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer",
        "-loop",
        "0",
        "out.gif",
      ]
    `);
    expect(A.audioMonoArgs({}, probe, { inputs: ['in0.wav'], output: 'out.wav' })).toMatchInlineSnapshot(`
      [
        "-i",
        "in0.wav",
        "-ac",
        "1",
        "out.wav",
      ]
    `);
    expect(A.videoSpeedArgs({ rate: 2 }, probe, io).join(' ')).toContain('atempo=');
    expect(A.videoDetectArgs({}, probe, io).join(' ')).toContain('blackdetect');
    expect(BACKLOG_PRESET_IDS).toHaveLength(18);
  });
});
