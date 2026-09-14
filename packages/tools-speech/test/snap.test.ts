import { describe, expect, it } from 'vitest';
import { cps, rmsCurve, snapCues } from '../src/captions/snap.js';

describe('snap / CPS', () => {
  it('snaps cue to speech after silence on a synthetic RMS curve', () => {
    const values = new Float32Array(100);
    for (let i = 0; i < 40; i++) values[i] = 0.001;
    for (let i = 40; i < 80; i++) values[i] = 0.2;
    for (let i = 80; i < 100; i++) values[i] = 0.001;
    const curve = { values, hopSec: 0.05 };
    const snapped = snapCues([{ start: 0.2, end: 5.5, text: 'Hi' }], curve, {
      silenceThreshold: 0.02,
      minDuration: 0.5,
      maxDuration: 7,
      maxCps: 21,
      padSec: 0,
    });
    expect(snapped[0]!.start).toBeGreaterThan(1.5);
    expect(snapped[0]!.start).toBeLessThan(2.3);
  });

  it('extends duration when CPS is too high', () => {
    const values = new Float32Array(200).fill(0.2);
    const curve = rmsCurve(values, 1, 1);
    const long = 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz';
    const snapped = snapCues([{ start: 0, end: 0.5, text: long }], { values: curve.values, hopSec: 0.05 }, {
      maxCps: 10,
      minDuration: 0.2,
      maxDuration: 20,
      silenceThreshold: 0.02,
      padSec: 0,
    });
    expect(cps(snapped[0]!)).toBeLessThanOrEqual(10.05);
    expect(snapped[0]!.end - snapped[0]!.start).toBeGreaterThan(4);
  });
});
