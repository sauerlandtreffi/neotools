import { luma } from '../codec/pixels.js';
import { resample } from '../codec/resample.js';

export function psnr(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const n = Math.min(a.length, b.length);
  if (!n) return Infinity;
  let mse = 0;
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    mse += d * d;
  }
  mse /= n;
  if (mse === 0) return 99;
  return 10 * Math.log10((255 * 255) / mse);
}

export function changedPixelRatio(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  threshold = 8,
): number {
  const n = Math.min(a.length, b.length) / 4;
  if (!n) return 0;
  let c = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const d =
      Math.abs((a[o] ?? 0) - (b[o] ?? 0)) +
      Math.abs((a[o + 1] ?? 0) - (b[o + 1] ?? 0)) +
      Math.abs((a[o + 2] ?? 0) - (b[o + 2] ?? 0));
    if (d > threshold) c += 1;
  }
  return c / n;
}

export function heatmap(
  a: Uint8ClampedArray,
  aw: number,
  ah: number,
  b: Uint8ClampedArray,
  bw: number,
  bh: number,
): { width: number; height: number; data: Uint8ClampedArray } {
  let left = a;
  let right = b;
  let w = aw;
  let h = ah;
  if (aw !== bw || ah !== bh) {
    const scaled = resample(b, bw, bh, aw, ah, 'bilinear');
    right = scaled.data;
    w = aw;
    h = ah;
    left = a;
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const da = Math.abs((left[o] ?? 0) - (right[o] ?? 0));
    const dg = Math.abs((left[o + 1] ?? 0) - (right[o + 1] ?? 0));
    const db = Math.abs((left[o + 2] ?? 0) - (right[o + 2] ?? 0));
    const mag = Math.min(255, Math.round((da + dg + db) / 3 * 2));
    out[o] = mag;
    out[o + 1] = Math.round(mag * 0.2);
    out[o + 2] = 255 - mag;
    out[o + 3] = 255;
  }
  void luma;
  return { width: w, height: h, data: out };
}
