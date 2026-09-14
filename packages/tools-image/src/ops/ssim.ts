import { luma } from '../codec/pixels.js';
import { resample } from '../codec/resample.js';

function gray(data: Uint8ClampedArray, w: number, h: number, target = 64): { g: Float64Array; w: number; h: number } {
  const scaled = w > target || h > target ? resample(data, w, h, target, Math.max(1, Math.round((h / w) * target)), 'box') : { data, width: w, height: h };
  const g = new Float64Array(scaled.width * scaled.height);
  for (let i = 0; i < scaled.width * scaled.height; i++) {
    g[i] = luma(scaled.data[i * 4]!, scaled.data[i * 4 + 1]!, scaled.data[i * 4 + 2]!) / 255;
  }
  return { g, w: scaled.width, h: scaled.height };
}

/** Grayscale SSIM on a downsampled grid (8×8 windows). */
export function ssim(
  a: Uint8ClampedArray,
  aw: number,
  ah: number,
  b: Uint8ClampedArray,
  bw: number,
  bh: number,
): number {
  const ga = gray(a, aw, ah);
  const gb = gray(b, bw, bh);
  const w = Math.min(ga.w, gb.w);
  const h = Math.min(ga.h, gb.h);
  const win = 8;
  const C1 = 0.01 ** 2;
  const C2 = 0.03 ** 2;
  let acc = 0;
  let n = 0;
  for (let y = 0; y <= h - win; y += win) {
    for (let x = 0; x <= w - win; x += win) {
      let meanA = 0;
      let meanB = 0;
      for (let j = 0; j < win; j++) {
        for (let i = 0; i < win; i++) {
          meanA += ga.g[(y + j) * ga.w + (x + i)] ?? 0;
          meanB += gb.g[(y + j) * gb.w + (x + i)] ?? 0;
        }
      }
      const area = win * win;
      meanA /= area;
      meanB /= area;
      let varA = 0;
      let varB = 0;
      let cov = 0;
      for (let j = 0; j < win; j++) {
        for (let i = 0; i < win; i++) {
          const pa = (ga.g[(y + j) * ga.w + (x + i)] ?? 0) - meanA;
          const pb = (gb.g[(y + j) * gb.w + (x + i)] ?? 0) - meanB;
          varA += pa * pa;
          varB += pb * pb;
          cov += pa * pb;
        }
      }
      varA /= area;
      varB /= area;
      cov /= area;
      acc += ((2 * meanA * meanB + C1) * (2 * cov + C2)) / ((meanA * meanA + meanB * meanB + C1) * (varA + varB + C2));
      n += 1;
    }
  }
  return n ? acc / n : 1;
}
