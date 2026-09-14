import { describe, expect, it } from 'vitest';
import { clusterSpeakerVectors } from '../src/whisper/diarize.js';

describe('diarization clustering', () => {
  it('assigns two clusters on synthetic MFCC vectors', () => {
    const a = [1, 0, 0, 0];
    const b = [0, 1, 0, 0];
    const labels = clusterSpeakerVectors([a, a, a, b, b, b], 6);
    const uniq = new Set(labels);
    expect(uniq.size).toBe(2);
    expect(labels[0]).toBe(labels[1]);
    expect(labels[0]).not.toBe(labels[5]);
  });
});
