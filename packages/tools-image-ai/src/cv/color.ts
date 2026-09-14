import type { RasterImage } from '../raster.js';

export function toGray(img: RasterImage): Float32Array {
  const g = new Float32Array(img.width * img.height);
  for (let i = 0, p = 0; i < img.data.length; i += 4, p++) {
    g[p] = 0.299 * img.data[i]! + 0.587 * img.data[i + 1]! + 0.114 * img.data[i + 2]!;
  }
  return g;
}

export function grayToRaster(gray: Float32Array, width: number, height: number): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i]!;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

export function parseHexColor(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim();
  if (h.length === 3) {
    return [parseInt(h[0]! + h[0]!, 16), parseInt(h[1]! + h[1]!, 16), parseInt(h[2]! + h[2]!, 16)];
  }
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
