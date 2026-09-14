import type { RasterImage } from '../raster.js';
import { parseHexColor } from './color.js';
import { resizeBilinear } from '../raster.js';

export type MockupKind = 'phone' | 'tablet' | 'window';

function fillRect(img: RasterImage, x: number, y: number, w: number, h: number, color: [number, number, number, number]): void {
  for (let yy = y; yy < y + h; yy++) {
    if (yy < 0 || yy >= img.height) continue;
    for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || xx >= img.width) continue;
      const o = (yy * img.width + xx) * 4;
      img.data[o] = color[0];
      img.data[o + 1] = color[1];
      img.data[o + 2] = color[2];
      img.data[o + 3] = color[3];
    }
  }
}

function blit(dest: RasterImage, src: RasterImage, x: number, y: number): void {
  for (let yy = 0; yy < src.height; yy++) {
    const dy = y + yy;
    if (dy < 0 || dy >= dest.height) continue;
    for (let xx = 0; xx < src.width; xx++) {
      const dx = x + xx;
      if (dx < 0 || dx >= dest.width) continue;
      dest.data.set(src.data.subarray((yy * src.width + xx) * 4, (yy * src.width + xx) * 4 + 4), (dy * dest.width + dx) * 4);
    }
  }
}

/** Generic (non-Apple) device/window frame. */
export function applyMockup(
  shot: RasterImage,
  kind: MockupKind,
  background = '#e8e4dc',
): RasterImage {
  const bg = parseHexColor(background);
  const bezel = kind === 'window' ? 8 : 18;
  const topExtra = kind === 'window' ? 28 : kind === 'tablet' ? 22 : 36;
  const bottomExtra = kind === 'phone' ? 28 : 16;
  const innerW = Math.min(720, shot.width);
  const innerH = Math.round(shot.height * (innerW / shot.width));
  const frameW = innerW + bezel * 2;
  const frameH = innerH + topExtra + bottomExtra;
  const canvasW = frameW + 80;
  const canvasH = frameH + 80;
  const out: RasterImage = {
    width: canvasW,
    height: canvasH,
    data: new Uint8ClampedArray(canvasW * canvasH * 4),
  };
  fillRect(out, 0, 0, canvasW, canvasH, [bg[0], bg[1], bg[2], 255]);
  const fx = 40;
  const fy = 32;
  fillRect(out, fx + 6, fy + 8, frameW, frameH, [30, 30, 30, 60]);
  fillRect(out, fx, fy, frameW, frameH, [36, 38, 42, 255]);
  if (kind === 'window') {
    fillRect(out, fx, fy, frameW, 26, [52, 56, 62, 255]);
    fillRect(out, fx + 12, fy + 9, 10, 10, [232, 92, 80, 255]);
    fillRect(out, fx + 28, fy + 9, 10, 10, [232, 196, 80, 255]);
    fillRect(out, fx + 44, fy + 9, 10, 10, [96, 196, 112, 255]);
  } else {
    fillRect(out, fx + frameW / 2 - 18, fy + 10, 36, 8, [20, 20, 22, 255]);
  }
  const fitted = resizeBilinear(shot, innerW, innerH);
  blit(out, fitted, fx + bezel, fy + topExtra);
  return out;
}
