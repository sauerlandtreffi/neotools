import { describe, expect, it } from 'vitest';
import { analyzeKeyBpm, syntheticClickWav } from '../src/analysis/key-bpm.js';

describe('key / BPM', () => {
  it('estimates 120 BPM from a synthetic click pattern ±2', () => {
    const wav = syntheticClickWav(120, 6, 22050);
    const result = analyzeKeyBpm(wav, 22050);
    expect(result.bpm).toBeGreaterThanOrEqual(118);
    expect(result.bpm).toBeLessThanOrEqual(122);
    expect(result.key).toMatch(/Dur|Moll/);
  });
});
