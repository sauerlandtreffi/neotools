import { describe, expect, it } from 'vitest';
import { neoFileFromBytes, runTool } from '@neotools/engine';
import { createMediaRegistry, extractAudio, lavfiAudio, lavfiVideo, probe } from '../src/index.js';
import { parseBleepSpans } from '../src/audio/tools.js';
import { parseKeepJson } from '../src/video/cutlist.js';
import { mediaCtx, skipIfNoFfmpeg } from './helpers.js';

describe('ffmpeg integration', () => {
  it('convert / trim / join / mute / split / gif / spectrogram / detect / normalize', async () => {
    if (await skipIfNoFfmpeg()) return;
    const ctx = await mediaCtx();
    const clip = await lavfiVideo(ctx, 2);
    const clipB = await lavfiVideo(ctx, 2);
    const wav = await lavfiAudio(ctx, 2);
    const info = await probe(clip, ctx);
    expect(info.duration).toBeGreaterThan(1.5);
    expect(info.streams.some((s) => s.type === 'video')).toBe(true);

    const registry = createMediaRegistry();

    const converted = await runTool(registry.require('video-convert'), ctx, [clip], {
      container: 'mp4',
      codec: 'mpeg4',
      crf: 8,
    });
    const cProbe = await probe(converted.outputs[0]!, ctx);
    expect(cProbe.container).toMatch(/mov|mp4/);
    expect(cProbe.streams.some((s) => s.type === 'video')).toBe(true);

    const trimmed = await runTool(registry.require('video-trim'), ctx, [clip], { startSec: 0.3, endSec: 1.4, copy: false });
    const tProbe = await probe(trimmed.outputs[0]!, ctx);
    expect(tProbe.duration).toBeGreaterThan(0.7);
    expect(tProbe.duration).toBeLessThan(1.5);

    const joined = await runTool(registry.require('video-join'), ctx, [clip, clipB], { forceEncode: true });
    const jProbe = await probe(joined.outputs[0]!, ctx);
    expect(jProbe.duration).toBeGreaterThan(3);

    const muted = await runTool(registry.require('video-mute'), ctx, [clip], {});
    const mProbe = await probe(muted.outputs[0]!, ctx);
    expect(mProbe.streams.filter((s) => s.type === 'audio')).toHaveLength(0);

    const split = await runTool(registry.require('video-split'), ctx, [clip], { segmentSec: 1, timestamps: '' });
    expect(split.outputs.length).toBeGreaterThanOrEqual(2);

    const gif = await runTool(registry.require('video-to-gif'), ctx, [clip], { fps: 8, width: 160 });
    const gifBytes = await gif.outputs[0]!.bytes();
    expect(String.fromCharCode(...gifBytes.slice(0, 6))).toBe('GIF89a');

    const spec = await runTool(registry.require('audio-spectrogram'), ctx, [wav], {});
    const png = await spec.outputs[0]!.bytes();
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);

    const det = await runTool(registry.require('video-detect'), ctx, [clip], {});
    expect(det.report).toBeTruthy();
    expect(det.report).toHaveProperty('scenes');
    expect(det.report).toHaveProperty('epilepsy');

    const norm = await runTool(registry.require('audio-normalize'), ctx, [wav], { targetLufs: '-16', truePeak: -1.5 });
    const ebu = norm.report as { ebuR128?: { input_i?: number }; targetLufs?: number };
    const measured = ebu.ebuR128?.input_i;
    expect(typeof ebu.targetLufs).toBe('number');
    if (typeof measured === 'number') {
      expect(Math.abs((ebu.targetLufs ?? -16) - -16)).toBeLessThanOrEqual(1);
    }

    const speech = await extractAudio(clip, { sampleRate: 16000, mono: true, format: 'wav' }, ctx);
    expect(speech.mime).toBe('audio/wav');
    expect(speech.size).toBeGreaterThan(1000);

    const cutJson = neoFileFromBytes(
      'keep.json',
      new TextEncoder().encode(JSON.stringify({ keep: [[0, 0.55], [1.15, 1.85]] })),
      'application/json',
    );
    const cut = await runTool(registry.require('video-cutlist'), ctx, [clip, cutJson], { copy: false });
    const cutProbe = await probe(cut.outputs[0]!, ctx);
    expect(cutProbe.duration).toBeGreaterThan(0.7);
    expect(cutProbe.duration).toBeLessThan(1.8);

    const bleepJson = neoFileFromBytes(
      'hits.json',
      new TextEncoder().encode(JSON.stringify({ hits: [{ start: 0.2, end: 0.55, word: 'x' }] })),
      'application/json',
    );
    const bleeped = await runTool(registry.require('audio-bleep'), ctx, [wav, bleepJson], {});
    expect((await bleeped.outputs[0]!.bytes()).byteLength).toBeGreaterThan(1000);
  }, 180000);

  it('parses transcript-edits keep and bleep-list hits without ffmpeg', () => {
    expect(parseKeepJson(JSON.stringify({ keep: [[0, 1], [2, 3]] }))).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(parseBleepSpans(JSON.stringify({ hits: [{ start: 1.2, end: 1.4, word: 'x' }] }), 'x-bleep.json')).toEqual([
      { start: 1.2, end: 1.4 },
    ]);
  });
});
