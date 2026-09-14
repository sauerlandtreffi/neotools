process.env.NEOTOOLS_FFMPEG_NATIVE = '0';

import { describe, expect, it } from 'vitest';
import { neoFileFromBytes, runTool } from '@neotools/engine';
import {
  FFMPEG_CORE_LICENSE_LGPL,
  createMediaRegistry,
  extractAudio,
  getFfmpegCoreLicense,
  lavfiAudio,
  lavfiVideo,
  probe,
  refreshMediaLicenses,
} from '../src/index.js';
import { detectLgplVendor, setFfmpegCoreFlavor } from '../src/ffmpeg/core-flavor.js';
import { mediaCtx, skipIfNoLgplCore } from './helpers.js';

describe('LGPL ffmpeg.wasm core', () => {
  it('labels the vendor core as LGPL-2.1-or-later (eigener Build)', () => {
    if (!detectLgplVendor()) {
      setFfmpegCoreFlavor('gpl');
      refreshMediaLicenses();
      expect(getFfmpegCoreLicense()).toBe('GPL-2.0-or-later (temporär)');
      setFfmpegCoreFlavor('lgpl');
      refreshMediaLicenses();
      expect(getFfmpegCoreLicense()).toBe(FFMPEG_CORE_LICENSE_LGPL);
      return;
    }
    setFfmpegCoreFlavor('lgpl');
    refreshMediaLicenses();
    expect(getFfmpegCoreLicense()).toBe(FFMPEG_CORE_LICENSE_LGPL);
  });

  it('probe / VP9-WebM / Opus / MP3 / AAC / loudnorm / subtitles / palettegen', async () => {
    if (await skipIfNoLgplCore()) return;
    process.env.NEOTOOLS_FFMPEG_NATIVE = '0';
    const ctx = mediaCtx();
    expect(ctx.platform.capabilities.ffmpegNative).toBe(false);
    const registry = createMediaRegistry();
    const clip = await lavfiVideo(ctx, 1.2);
    const wav = await lavfiAudio(ctx, 1.2);

    const info = await probe(clip, ctx);
    expect(info.duration).toBeGreaterThan(0.8);
    expect(info.streams.some((s) => s.type === 'video')).toBe(true);

    const webm = await runTool(registry.require('video-convert'), ctx, [clip], {
      container: 'webm',
      codec: 'vp9',
      crf: 36,
    });
    const webmProbe = await probe(webm.outputs[0]!, ctx);
    expect(webmProbe.container).toMatch(/webm|matroska/);
    expect(webmProbe.streams.some((s) => /vp9|libvpx/i.test(s.codec ?? ''))).toBe(true);

    const opus = await runTool(registry.require('audio-convert'), ctx, [wav], { container: 'opus', bitrateKbps: 64 });
    const opusProbe = await probe(opus.outputs[0]!, ctx);
    expect(opusProbe.streams.some((s) => /opus/i.test(s.codec ?? ''))).toBe(true);

    const mp3 = await runTool(registry.require('audio-convert'), ctx, [wav], { container: 'mp3', bitrateKbps: 96 });
    const mp3Bytes = await mp3.outputs[0]!.bytes();
    // libmp3lame + mp3 muxer write an ID3v2 header by default; a bare frame sync (0xFFFx) is also valid.
    const id3 = String.fromCharCode(...mp3Bytes.slice(0, 3)) === 'ID3';
    expect(id3 || (mp3Bytes[0] === 0xff && (mp3Bytes[1]! & 0xe0) === 0xe0)).toBe(true);
    const mp3Probe = await probe(mp3.outputs[0]!, ctx);
    expect(mp3Probe.streams.some((s) => /mp3|lame/i.test(s.codec ?? ''))).toBe(true);

    const aac = await runTool(registry.require('audio-convert'), ctx, [wav], { container: 'm4a', bitrateKbps: 96 });
    const aacProbe = await probe(aac.outputs[0]!, ctx);
    expect(aacProbe.streams.some((s) => /aac/i.test(s.codec ?? ''))).toBe(true);

    const norm = await runTool(registry.require('audio-normalize'), ctx, [wav], { targetLufs: '-16', truePeak: -1.5 });
    const ebu = norm.report as { ebuR128?: { input_i?: number }; targetLufs?: number };
    expect(typeof ebu.targetLufs).toBe('number');

    const srt = neoFileFromBytes(
      'subs.srt',
      new TextEncoder().encode('1\n00:00:00,000 --> 00:00:01,000\nNeoTools LGPL\n'),
      'application/x-subrip',
    );
    const burned = await runTool(registry.require('video-subtitles-burn'), ctx, [clip, srt], {});
    expect((await burned.outputs[0]!.bytes()).byteLength).toBeGreaterThan(1000);

    const gif = await runTool(registry.require('video-to-gif'), ctx, [clip], { fps: 6, width: 120 });
    const gifBytes = await gif.outputs[0]!.bytes();
    expect(String.fromCharCode(...gifBytes.slice(0, 6))).toBe('GIF89a');

    const speech = await extractAudio(clip, { sampleRate: 16000, mono: true, format: 'wav' }, ctx);
    expect(speech.size).toBeGreaterThan(1000);
    expect(getFfmpegCoreLicense()).toBe(FFMPEG_CORE_LICENSE_LGPL);
  }, 300000);
});
