import { toGray } from './color.js';
import { cannyLight, houghLines } from './edges.js';
import type { RasterImage } from '../raster.js';

/** Estimate skew in degrees (positive = clockwise) via projection profile + Hough. */
export function estimateSkewDegrees(img: RasterImage): number {
  const gray = toGray(img);
  const edges = cannyLight(gray, img.width, img.height);
  const lines = houghLines(edges, img.width, img.height, Math.max(12, Math.round(img.width * 0.08)));
  const angles: number[] = [];
  for (const l of lines) {
    let deg = (l.theta * 180) / Math.PI - 90;
    while (deg > 45) deg -= 90;
    while (deg < -45) deg += 90;
    if (Math.abs(deg) < 30) angles.push(deg);
  }
  if (angles.length) {
    angles.sort((a, b) => a - b);
    return angles[Math.floor(angles.length / 2)]!;
  }
  return projectionSkew(gray, img.width, img.height);
}

function projectionSkew(gray: Float32Array, width: number, height: number): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let deg = -15; deg <= 15; deg += 0.5) {
    const rad = (deg * Math.PI) / 180;
    const proj = new Float64Array(height);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x += 2) {
        const yy = Math.round((x - width / 2) * sin + (y - height / 2) * cos + height / 2);
        if (yy >= 0 && yy < height) proj[yy] = (proj[yy] ?? 0) + (255 - gray[y * width + x]!);
      }
    }
    let score = 0;
    for (let i = 1; i < height; i++) score += Math.abs(proj[i]! - proj[i - 1]!);
    if (score > bestScore) {
      bestScore = score;
      best = deg;
    }
  }
  return best;
}

export function rotateRaster(img: RasterImage, degrees: number, fill = 255): RasterImage {
  if (Math.abs(degrees) < 0.05) {
    return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  }
  const rad = (-degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = (img.width - 1) / 2;
  const cy = (img.height - 1) / 2;
  const corners = [
    [0, 0],
    [img.width, 0],
    [img.width, img.height],
    [0, img.height],
  ].map(([x, y]) => {
    const dx = (x ?? 0) - cx;
    const dy = (y ?? 0) - cy;
    return [dx * cos - dy * sin, dx * sin + dy * cos];
  });
  const xs = corners.map((c) => c[0]!);
  const ys = corners.map((c) => c[1]!);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(1, Math.round(maxX - minX));
  const h = Math.max(1, Math.round(maxY - minY));
  const data = new Uint8ClampedArray(w * h * 4);
  const ncx = (w - 1) / 2;
  const ncy = (h - 1) / 2;
  const invCos = Math.cos(-rad);
  const invSin = Math.sin(-rad);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - ncx;
      const dy = y - ncy;
      const sx = dx * invCos - dy * invSin + cx;
      const sy = dx * invSin + dy * invCos + cy;
      const o = (y * w + x) * 4;
      if (sx < 0 || sy < 0 || sx >= img.width - 1 || sy >= img.height - 1) {
        data[o] = fill;
        data[o + 1] = fill;
        data[o + 2] = fill;
        data[o + 3] = 255;
        continue;
      }
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const tx = sx - x0;
      const ty = sy - y0;
      for (let c = 0; c < 4; c++) {
        const p00 = img.data[(y0 * img.width + x0) * 4 + c]!;
        const p10 = img.data[(y0 * img.width + x0 + 1) * 4 + c]!;
        const p01 = img.data[((y0 + 1) * img.width + x0) * 4 + c]!;
        const p11 = img.data[((y0 + 1) * img.width + x0 + 1) * 4 + c]!;
        data[o + c] = p00 * (1 - tx) * (1 - ty) + p10 * tx * (1 - ty) + p01 * (1 - tx) * ty + p11 * tx * ty;
      }
    }
  }
  return { width: w, height: h, data };
}
