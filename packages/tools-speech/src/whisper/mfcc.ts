/** Lightweight MFCC-mean embedding per segment (no model). */

export function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, n - 1)));
  return w;
}

export function dftMag(frame: Float64Array): Float64Array {
  const n = frame.length;
  const half = Math.floor(n / 2);
  const mag = new Float64Array(half);
  for (let k = 0; k < half; k++) {
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t++) {
      const ang = (-2 * Math.PI * k * t) / n;
      re += frame[t]! * Math.cos(ang);
      im += frame[t]! * Math.sin(ang);
    }
    mag[k] = Math.hypot(re, im);
  }
  return mag;
}

export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}
export function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

export function mfccMean(
  samples: Float32Array,
  sampleRate: number,
  nMfcc = 13,
  nMels = 26,
  frameSec = 0.025,
  hopSec = 0.01,
): Float64Array {
  const frame = Math.max(32, Math.round(sampleRate * frameSec));
  const hop = Math.max(16, Math.round(sampleRate * hopSec));
  const window = hann(frame);
  const acc = new Float64Array(nMfcc);
  let count = 0;
  const nyquist = sampleRate / 2;
  const melMin = hzToMel(0);
  const melMax = hzToMel(nyquist);
  const melPoints = new Float64Array(nMels + 2);
  for (let i = 0; i < melPoints.length; i++) {
    melPoints[i] = melToHz(melMin + ((melMax - melMin) * i) / (nMels + 1));
  }
  for (let start = 0; start + frame <= samples.length; start += hop) {
    const buf = new Float64Array(frame);
    for (let i = 0; i < frame; i++) {
      const x = samples[start + i] ?? 0;
      buf[i] = (i === 0 ? x : x - 0.97 * (samples[start + i - 1] ?? 0)) * window[i]!;
    }
    const mag = dftMag(buf);
    const mels = new Float64Array(nMels);
    for (let m = 0; m < nMels; m++) {
      const left = melPoints[m]!;
      const center = melPoints[m + 1]!;
      const right = melPoints[m + 2]!;
      let e = 0;
      for (let k = 0; k < mag.length; k++) {
        const hz = (k * nyquist) / mag.length;
        let w = 0;
        if (hz >= left && hz <= center) w = (hz - left) / Math.max(1e-9, center - left);
        else if (hz > center && hz <= right) w = (right - hz) / Math.max(1e-9, right - center);
        e += (mag[k] ?? 0) * w;
      }
      mels[m] = Math.log(e + 1e-9);
    }
    for (let j = 0; j < nMfcc; j++) {
      let s = 0;
      for (let m = 0; m < nMels; m++) {
        s += mels[m]! * Math.cos((Math.PI * j * (m + 0.5)) / nMels);
      }
      acc[j] = (acc[j] ?? 0) + s;
    }
    count += 1;
  }
  if (!count) return acc;
  for (let j = 0; j < nMfcc; j++) acc[j] = acc[j]! / count;
  return acc;
}
