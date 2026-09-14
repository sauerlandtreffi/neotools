import { luma } from '../codec/pixels.js';
import { resample } from '../codec/resample.js';

function gray(data: Uint8ClampedArray, w: number, h: number, tw: number, th: number): Float64Array {
  const s = resample(data, w, h, tw, th, 'box');
  const g = new Float64Array(tw * th);
  for (let i = 0; i < tw * th; i++) g[i] = luma(s.data[i * 4]!, s.data[i * 4 + 1]!, s.data[i * 4 + 2]!);
  return g;
}

export function dHash(data: Uint8ClampedArray, w: number, h: number): bigint {
  const g = gray(data, w, h, 9, 8);
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits <<= 1n;
      if ((g[y * 9 + x] ?? 0) > (g[y * 9 + x + 1] ?? 0)) bits |= 1n;
    }
  }
  return bits;
}

export function pHash(data: Uint8ClampedArray, w: number, h: number): bigint {
  const n = 32;
  const g = gray(data, w, h, n, n);
  const dct = new Float64Array(n * n);
  for (let u = 0; u < n; u++) {
    for (let v = 0; v < n; v++) {
      let sum = 0;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          sum +=
            (g[y * n + x] ?? 0) *
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * n)) *
            Math.cos(((2 * y + 1) * v * Math.PI) / (2 * n));
        }
      }
      const cu = u === 0 ? 1 / Math.SQRT2 : 1;
      const cv = v === 0 ? 1 / Math.SQRT2 : 1;
      dct[u * n + v] = 0.25 * cu * cv * sum;
    }
  }
  const low: number[] = [];
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) if (!(u === 0 && v === 0)) low.push(dct[u * n + v] ?? 0);
  const mid = [...low].sort((a, b) => a - b)[Math.floor(low.length / 2)] ?? 0;
  let bits = 0n;
  for (const v of low) {
    bits <<= 1n;
    if (v > mid) bits |= 1n;
  }
  return bits;
}

export function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let n = 0;
  while (x) {
    x &= x - 1n;
    n += 1;
  }
  return n;
}
