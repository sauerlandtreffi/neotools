import { resample } from '../codec/resample.js';
import { hexToRgb } from '../codec/pixels.js';
import { loadOflFont, stampOpenType } from '../fonts/ofl.js';
import { measureBitmap, stampBitmap } from '../fonts/bitmap.js';

export type WatermarkPosition =
  | 'center'
  | 'nw'
  | 'n'
  | 'ne'
  | 'w'
  | 'e'
  | 'sw'
  | 's'
  | 'se'
  | 'tile';

function place(pos: WatermarkPosition, dw: number, dh: number, ww: number, wh: number): Array<{ x: number; y: number }> {
  if (pos === 'tile') {
    const out: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < dh; y += wh + 16) {
      for (let x = 0; x < dw; x += ww + 16) out.push({ x, y });
    }
    return out;
  }
  let x = Math.round((dw - ww) / 2);
  let y = Math.round((dh - wh) / 2);
  if (pos.includes('w') && pos !== 'sw' && pos !== 'nw') x = 8;
  if (pos === 'w' || pos === 'nw' || pos === 'sw') x = 8;
  if (pos === 'e' || pos === 'ne' || pos === 'se') x = dw - ww - 8;
  if (pos === 'n' || pos === 'nw' || pos === 'ne') y = 8;
  if (pos === 's' || pos === 'sw' || pos === 'se') y = dh - wh - 8;
  return [{ x, y }];
}

function blendImage(
  dest: Uint8ClampedArray,
  dw: number,
  dh: number,
  src: Uint8ClampedArray,
  sw: number,
  sh: number,
  x: number,
  y: number,
  opacity: number,
): void {
  for (let sy = 0; sy < sh; sy++) {
    const dy = y + sy;
    if (dy < 0 || dy >= dh) continue;
    for (let sx = 0; sx < sw; sx++) {
      const dx = x + sx;
      if (dx < 0 || dx >= dw) continue;
      const si = (sy * sw + sx) * 4;
      const di = (dy * dw + dx) * 4;
      const a = ((src[si + 3] ?? 255) / 255) * opacity;
      dest[di] = Math.round((dest[di] ?? 0) * (1 - a) + (src[si] ?? 0) * a);
      dest[di + 1] = Math.round((dest[di + 1] ?? 0) * (1 - a) + (src[si + 1] ?? 0) * a);
      dest[di + 2] = Math.round((dest[di + 2] ?? 0) * (1 - a) + (src[si + 2] ?? 0) * a);
    }
  }
}

export async function applyTextWatermark(
  dest: Uint8ClampedArray,
  dw: number,
  dh: number,
  text: string,
  opts: { position: WatermarkPosition; opacity: number; scale: number; color: string },
): Promise<void> {
  const rgb = hexToRgb(opts.color);
  const rgba: [number, number, number, number] = [rgb[0], rgb[1], rgb[2], Math.round(opts.opacity * 255)];
  const font = await loadOflFont();
  const fontSize = Math.max(10, Math.round(Math.min(dw, dh) * 0.06 * opts.scale));
  if (font) {
    const approxW = fontSize * text.length * 0.55;
    for (const p of place(opts.position, dw, dh, approxW, fontSize)) {
      stampOpenType(font, dest, dw, dh, text, p.x, p.y, fontSize, rgba);
    }
    return;
  }
  const scale = Math.max(1, Math.round(fontSize / 8));
  const m = measureBitmap(text, scale);
  for (const p of place(opts.position, dw, dh, m.width, m.height)) {
    stampBitmap(dest, dw, dh, text, p.x, p.y, scale, rgba);
  }
}

export function applyImageWatermark(
  dest: Uint8ClampedArray,
  dw: number,
  dh: number,
  mark: Uint8ClampedArray,
  mw: number,
  mh: number,
  opts: { position: WatermarkPosition; opacity: number; scale: number },
): void {
  const tw = Math.max(1, Math.round(mw * opts.scale));
  const th = Math.max(1, Math.round(mh * opts.scale));
  const scaled = tw === mw && th === mh ? { data: mark, width: mw, height: mh } : resample(mark, mw, mh, tw, th, 'bilinear');
  for (const p of place(opts.position, dw, dh, scaled.width, scaled.height)) {
    blendImage(dest, dw, dh, scaled.data, scaled.width, scaled.height, p.x, p.y, opts.opacity);
  }
}
