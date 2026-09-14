import type { RasterImage } from '../raster.js';
import { toGray, grayToRaster } from './color.js';
import { gaussianBlurGray } from './gauss.js';
import { sauvola } from './sauvola.js';

/** Estimate background with a large blur and divide to flatten shadows. */
export function removeShadows(img: RasterImage, sigma = 28): RasterImage {
  const gray = toGray(img);
  const bg = gaussianBlurGray(gray, img.width, img.height, sigma);
  const data = new Uint8ClampedArray(img.data);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = gray[p]!;
    const b = Math.max(8, bg[p]!);
    const scale = 220 / b;
    data[i] = Math.min(255, img.data[i]! * scale);
    data[i + 1] = Math.min(255, img.data[i + 1]! * scale);
    data[i + 2] = Math.min(255, img.data[i + 2]! * scale);
    void g;
  }
  return { width: img.width, height: img.height, data };
}

export function brightenColor(img: RasterImage, gain = 1.15): RasterImage {
  const data = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i]!;
    const g = img.data[i + 1]!;
    const b = img.data[i + 2]!;
    const max = Math.max(r, g, b, 1);
    const lift = 255 / max;
    const f = Math.min(gain, lift);
    data[i] = Math.min(255, r * f + 12);
    data[i + 1] = Math.min(255, g * f + 12);
    data[i + 2] = Math.min(255, b * f + 12);
    data[i + 3] = img.data[i + 3]!;
  }
  return { width: img.width, height: img.height, data };
}

export function binarizeScan(img: RasterImage): RasterImage {
  const gray = toGray(img);
  const bin = sauvola(gray, img.width, img.height, 25, 0.34);
  const f = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) f[i] = bin[i]!;
  return grayToRaster(f, img.width, img.height);
}

/** Light descreen: mild gauss + unsharp. */
export function descreen(img: RasterImage): RasterImage {
  const gray = toGray(img);
  const blur = gaussianBlurGray(gray, img.width, img.height, 0.9);
  const data = new Uint8ClampedArray(img.data);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const u = gray[p]! + 0.6 * (gray[p]! - blur[p]!);
    const scale = gray[p]! > 1 ? u / gray[p]! : 1;
    data[i] = Math.max(0, Math.min(255, img.data[i]! * scale));
    data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1]! * scale));
    data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2]! * scale));
  }
  return { width: img.width, height: img.height, data };
}
