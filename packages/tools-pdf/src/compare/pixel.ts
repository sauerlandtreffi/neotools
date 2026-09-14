import type { Platform } from '@neotools/engine';
import { openPdfjsDocument } from '../pdfjs.js';
import { createDrawCanvas, renderPdfjsPage } from '../render-page.js';
import { encodePngRgba } from '../codecs/png-bytes.js';

export interface PagePixelDiff {
  pageLeft: number;
  pageRight: number;
  changedRatio: number;
  ssim: number;
  heatmapPng?: Uint8Array;
}

export interface PixelCompareResult {
  skipped: boolean;
  reason?: string;
  pages: PagePixelDiff[];
}

function luma(data: Uint8ClampedArray, i: number): number {
  return 0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0);
}

export function ssimGray(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number): number {
  const n = width * height;
  if (!n) return 1;
  let meanA = 0;
  let meanB = 0;
  for (let p = 0; p < n; p++) {
    meanA += luma(a, p * 4);
    meanB += luma(b, p * 4);
  }
  meanA /= n;
  meanB /= n;
  let varA = 0;
  let varB = 0;
  let cov = 0;
  for (let p = 0; p < n; p++) {
    const da = luma(a, p * 4) - meanA;
    const db = luma(b, p * 4) - meanB;
    varA += da * da;
    varB += db * db;
    cov += da * db;
  }
  varA /= n;
  varB /= n;
  cov /= n;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  return ((2 * meanA * meanB + c1) * (2 * cov + c2)) / ((meanA * meanA + meanB * meanB + c1) * (varA + varB + c2));
}

function heatmap(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  height: number,
): { ratio: number; rgba: Uint8ClampedArray } {
  const out = new Uint8ClampedArray(width * height * 4);
  let changed = 0;
  const n = width * height;
  const thresh = 18;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const d =
      Math.abs((a[i] ?? 0) - (b[i] ?? 0)) +
      Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0)) +
      Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0));
    const base = ((a[i] ?? 0) + (b[i] ?? 0)) / 2;
    if (d > thresh) {
      changed += 1;
      out[i] = 220;
      out[i + 1] = Math.min(80, base);
      out[i + 2] = Math.min(80, base);
      out[i + 3] = 255;
    } else {
      out[i] = base;
      out[i + 1] = base;
      out[i + 2] = base;
      out[i + 3] = 255;
    }
  }
  return { ratio: n ? changed / n : 0, rgba: out };
}

function canvasAvailable(platform: Platform): boolean {
  if (platform.capabilities.canvas) return true;
  if (typeof OffscreenCanvas !== 'undefined') return true;
  return false;
}

export async function comparePdfPixels(
  leftBytes: Uint8Array,
  rightBytes: Uint8Array,
  platform: Platform,
  alignment: Array<{ left: number | null; right: number | null }>,
  dpi = 72,
): Promise<PixelCompareResult> {
  if (!canvasAvailable(platform)) {
    return {
      skipped: true,
      reason:
        'Pixel-Diff braucht OffscreenCanvas (Browser) oder @napi-rs/canvas (Node). Modus übersprungen.',
      pages: [],
    };
  }
  try {
    await createDrawCanvas(8, 8, platform);
  } catch (err) {
    return {
      skipped: true,
      reason: err instanceof Error ? err.message : String(err),
      pages: [],
    };
  }

  const leftPdf = await openPdfjsDocument(leftBytes);
  const rightPdf = await openPdfjsDocument(rightBytes);
  const pages: PagePixelDiff[] = [];
  for (const pair of alignment) {
    if (pair.left === null || pair.right === null) continue;
    const lp = await leftPdf.getPage(pair.left);
    const rp = await rightPdf.getPage(pair.right);
    const lr = await renderPdfjsPage(lp, dpi, platform);
    const rr = await renderPdfjsPage(rp, dpi, platform);
    const w = Math.min(lr.width, rr.width);
    const h = Math.min(lr.height, rr.height);
    const crop = (src: { data: Uint8ClampedArray; width: number }, width: number, height: number) => {
      const out = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        out.set(src.data.subarray(y * src.width * 4, y * src.width * 4 + width * 4), y * width * 4);
      }
      return out;
    };
    const a = crop(lr, w, h);
    const b = crop(rr, w, h);
    const heat = heatmap(a, b, w, h);
    pages.push({
      pageLeft: pair.left,
      pageRight: pair.right,
      changedRatio: heat.ratio,
      ssim: ssimGray(a, b, w, h),
      heatmapPng: encodePngRgba(heat.rgba, w, h),
    });
  }
  await leftPdf.destroy();
  await rightPdf.destroy();
  return { skipped: false, pages };
}
