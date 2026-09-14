import { clampByte } from './pixels.js';

export type ResampleFilter = 'lanczos3' | 'box' | 'bilinear' | 'auto';

function sinc(x: number): number {
  if (Math.abs(x) < 1e-8) return 1;
  const pix = Math.PI * x;
  return Math.sin(pix) / pix;
}

function lanczos3(x: number): number {
  const ax = Math.abs(x);
  if (ax >= 3) return 0;
  return sinc(x) * sinc(x / 3);
}

function premultiply(data: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = (data[i + 3] ?? 0) / 255;
    out[i] = ((data[i] ?? 0) / 255) * a;
    out[i + 1] = ((data[i + 1] ?? 0) / 255) * a;
    out[i + 2] = ((data[i + 2] ?? 0) / 255) * a;
    out[i + 3] = a;
  }
  return out;
}

function unpremultiply(src: Float32Array, dest: Uint8ClampedArray): void {
  for (let i = 0; i < dest.length; i += 4) {
    const a = src[i + 3] ?? 0;
    if (a <= 1e-6) {
      dest[i] = 0;
      dest[i + 1] = 0;
      dest[i + 2] = 0;
      dest[i + 3] = 0;
      continue;
    }
    dest[i] = clampByte(Math.round(((src[i] ?? 0) / a) * 255));
    dest[i + 1] = clampByte(Math.round(((src[i + 1] ?? 0) / a) * 255));
    dest[i + 2] = clampByte(Math.round(((src[i + 2] ?? 0) / a) * 255));
    dest[i + 3] = clampByte(Math.round(a * 255));
  }
}

function sampleBilinear(src: Float32Array, sw: number, sh: number, x: number, y: number, out: Float32Array, oi: number): void {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(sw - 1, x0 + 1);
  const y1 = Math.min(sh - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const i00 = (Math.max(0, y0) * sw + Math.max(0, x0)) * 4;
  const i10 = (Math.max(0, y0) * sw + x1) * 4;
  const i01 = (y1 * sw + Math.max(0, x0)) * 4;
  const i11 = (y1 * sw + x1) * 4;
  for (let c = 0; c < 4; c++) {
    const a = (src[i00 + c] ?? 0) * (1 - tx) + (src[i10 + c] ?? 0) * tx;
    const b = (src[i01 + c] ?? 0) * (1 - tx) + (src[i11 + c] ?? 0) * tx;
    out[oi + c] = a * (1 - ty) + b * ty;
  }
}

function sampleKernel(
  src: Float32Array,
  sw: number,
  sh: number,
  x: number,
  y: number,
  radius: number,
  kernel: (t: number) => number,
  out: Float32Array,
  oi: number,
): void {
  const x0 = Math.floor(x - radius + 1e-6);
  const x1 = Math.ceil(x + radius);
  const y0 = Math.floor(y - radius + 1e-6);
  const y1 = Math.ceil(y + radius);
  let wr = 0;
  let wg = 0;
  let wb = 0;
  let wa = 0;
  let wsum = 0;
  for (let yy = y0; yy <= y1; yy++) {
    const sy = yy < 0 ? 0 : yy >= sh ? sh - 1 : yy;
    const ky = kernel(yy - y);
    for (let xx = x0; xx <= x1; xx++) {
      const sx = xx < 0 ? 0 : xx >= sw ? sw - 1 : xx;
      const w = ky * kernel(xx - x);
      if (w === 0) continue;
      const si = (sy * sw + sx) * 4;
      wr += (src[si] ?? 0) * w;
      wg += (src[si + 1] ?? 0) * w;
      wb += (src[si + 2] ?? 0) * w;
      wa += (src[si + 3] ?? 0) * w;
      wsum += w;
    }
  }
  if (wsum === 0) wsum = 1;
  out[oi] = wr / wsum;
  out[oi + 1] = wg / wsum;
  out[oi + 2] = wb / wsum;
  out[oi + 3] = wa / wsum;
}

function sampleBox(src: Float32Array, sw: number, sh: number, x0: number, y0: number, x1: number, y1: number, out: Float32Array, oi: number): void {
  const xa = Math.max(0, Math.floor(x0));
  const ya = Math.max(0, Math.floor(y0));
  const xb = Math.min(sw - 1, Math.ceil(x1) - 1);
  const yb = Math.min(sh - 1, Math.ceil(y1) - 1);
  let wr = 0;
  let wg = 0;
  let wb = 0;
  let wa = 0;
  let n = 0;
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const si = (y * sw + x) * 4;
      wr += src[si] ?? 0;
      wg += src[si + 1] ?? 0;
      wb += src[si + 2] ?? 0;
      wa += src[si + 3] ?? 0;
      n += 1;
    }
  }
  if (!n) n = 1;
  out[oi] = wr / n;
  out[oi + 1] = wg / n;
  out[oi + 2] = wb / n;
  out[oi + 3] = wa / n;
}

/**
 * Resample RGBA with alpha premultiply.
 * Downscale: Lanczos3 (default) or Box. Upscale: bilinear.
 */
export function resample(
  data: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
  filter: ResampleFilter = 'auto',
): { width: number; height: number; data: Uint8ClampedArray } {
  destW = Math.max(1, Math.round(destW));
  destH = Math.max(1, Math.round(destH));
  if (destW === srcW && destH === srcH) return { width: srcW, height: srcH, data: new Uint8ClampedArray(data) };
  const down = destW < srcW || destH < srcH;
  const mode: ResampleFilter = filter === 'auto' ? (down ? 'lanczos3' : 'bilinear') : filter;
  const src = premultiply(data);
  const dest = new Uint8ClampedArray(destW * destH * 4);
  const tmp = new Float32Array(destW * destH * 4);
  const scaleX = srcW / destW;
  const scaleY = srcH / destH;
  for (let y = 0; y < destH; y++) {
    for (let x = 0; x < destW; x++) {
      const oi = (y * destW + x) * 4;
      if (mode === 'bilinear') {
        sampleBilinear(src, srcW, srcH, (x + 0.5) * scaleX - 0.5, (y + 0.5) * scaleY - 0.5, tmp, oi);
      } else if (mode === 'box' && down) {
        sampleBox(src, srcW, srcH, x * scaleX, y * scaleY, (x + 1) * scaleX, (y + 1) * scaleY, tmp, oi);
      } else {
        sampleKernel(src, srcW, srcH, (x + 0.5) * scaleX - 0.5, (y + 0.5) * scaleY - 0.5, 3, lanczos3, tmp, oi);
      }
    }
  }
  unpremultiply(tmp, dest);
  return { width: destW, height: destH, data: dest };
}
