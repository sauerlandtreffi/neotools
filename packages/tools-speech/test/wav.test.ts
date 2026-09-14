import { describe, expect, it } from 'vitest';
import { parseWav, writeWavPcm16 } from '../src/audio/wav.js';

describe('WAV parser', () => {
  it('roundtrips PCM16 mono', () => {
    const samples = new Float32Array(1600);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.5;
    const bytes = writeWavPcm16(samples, 16000, 1);
    const src = parseWav(bytes, { sampleRate: 16000, mono: true });
    expect(src.sampleRate).toBe(16000);
    expect(src.channels).toBe(1);
    expect(src.samples.length).toBe(1600);
    expect(Math.max(...src.samples)).toBeGreaterThan(0.3);
  });
});
