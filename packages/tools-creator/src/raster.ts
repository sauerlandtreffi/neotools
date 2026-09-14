import { neoFileFromBytes, type NeoFile } from '@neotools/engine';
import {
  decode,
  encode,
  encodePngRgba,
  resample,
  type DecodedImage,
  type ImageFormat,
} from '@neotools/tools-image';
import { boxFromAspect, cropRect } from '@neotools/tools-image';
import { fillBackground, hexToRgb } from '@neotools/tools-image';

export async function decodeAny(file: NeoFile): Promise<DecodedImage> {
  const bytes = await file.bytes();
  return decode({ bytes, name: file.name, mime: file.mime }, { applyOrientation: true });
}

export async function encodeNamed(
  img: DecodedImage,
  format: ImageFormat,
  filename: string,
  quality = 85,
): Promise<NeoFile> {
  const bytes = await encode(img, format, { quality, keepMetadata: false });
  const mime =
    format === 'jpeg'
      ? 'image/jpeg'
      : format === 'webp'
        ? 'image/webp'
        : format === 'avif'
          ? 'image/avif'
          : 'image/png';
  return neoFileFromBytes(filename, bytes, mime);
}

export function pngBytes(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  return encodePngRgba(data, width, height);
}

export function coverFit(
  data: Uint8ClampedArray,
  sw: number,
  sh: number,
  tw: number,
  th: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const scale = Math.max(tw / sw, th / sh);
  const cw = Math.max(1, Math.round(sw * scale));
  const ch = Math.max(1, Math.round(sh * scale));
  const scaled = resample(data, sw, sh, cw, ch, scale < 1 ? 'lanczos3' : 'bilinear');
  const cropped = cropRect(scaled.data, scaled.width, scaled.height, boxFromAspect(scaled.width, scaled.height, tw / th, 'center'));
  if (cropped.width === tw && cropped.height === th) return cropped;
  const r = resample(cropped.data, cropped.width, cropped.height, tw, th, 'lanczos3');
  return { data: r.data, width: r.width, height: r.height };
}

export function containPad(
  data: Uint8ClampedArray,
  sw: number,
  sh: number,
  tw: number,
  th: number,
  bg: [number, number, number] = [0, 0, 0],
): { data: Uint8ClampedArray; width: number; height: number } {
  const scale = Math.min(tw / sw, th / sh);
  const cw = Math.max(1, Math.round(sw * scale));
  const ch = Math.max(1, Math.round(sh * scale));
  const scaled = resample(data, sw, sh, cw, ch, scale < 1 ? 'lanczos3' : 'bilinear');
  const out = new Uint8ClampedArray(tw * th * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = bg[0];
    out[i + 1] = bg[1];
    out[i + 2] = bg[2];
    out[i + 3] = 255;
  }
  const ox = Math.floor((tw - cw) / 2);
  const oy = Math.floor((th - ch) / 2);
  blit(out, tw, th, scaled.data, cw, ch, ox, oy);
  return { data: out, width: tw, height: th };
}

export function blurFill(
  data: Uint8ClampedArray,
  sw: number,
  sh: number,
  tw: number,
  th: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const cover = coverFit(data, sw, sh, tw, th);
  const blurred = boxBlur(cover.data, tw, th, Math.max(8, Math.round(Math.min(tw, th) / 24)));
  const inner = containPad(data, sw, sh, tw, th, [0, 0, 0]);
  for (let i = 0; i < inner.data.length; i += 4) {
    const a = inner.data[i + 3] ?? 255;
    if (a < 250 && inner.data[i] === 0 && inner.data[i + 1] === 0 && inner.data[i + 2] === 0) {
      inner.data[i] = blurred[i] ?? 0;
      inner.data[i + 1] = blurred[i + 1] ?? 0;
      inner.data[i + 2] = blurred[i + 2] ?? 0;
      inner.data[i + 3] = 255;
    }
  }
  // containPad fills black; overlay the sharp contain on the blur
  const sharp = containOn(data, sw, sh, tw, th, blurred);
  return sharp;
}

function containOn(
  data: Uint8ClampedArray,
  sw: number,
  sh: number,
  tw: number,
  th: number,
  bg: Uint8ClampedArray,
): { data: Uint8ClampedArray; width: number; height: number } {
  const scale = Math.min(tw / sw, th / sh);
  const cw = Math.max(1, Math.round(sw * scale));
  const ch = Math.max(1, Math.round(sh * scale));
  const scaled = resample(data, sw, sh, cw, ch, scale < 1 ? 'lanczos3' : 'bilinear');
  const out = new Uint8ClampedArray(bg);
  const ox = Math.floor((tw - cw) / 2);
  const oy = Math.floor((th - ch) / 2);
  blit(out, tw, th, scaled.data, cw, ch, ox, oy);
  return { data: out, width: tw, height: th };
}

export function blit(
  dest: Uint8ClampedArray,
  dw: number,
  dh: number,
  src: Uint8ClampedArray,
  sw: number,
  sh: number,
  x: number,
  y: number,
  opacity = 1,
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
      dest[di + 3] = 255;
    }
  }
}

export function boxBlur(data: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  const r = Math.max(1, radius);
  const tmp = new Uint8ClampedArray(data.length);
  const out = new Uint8ClampedArray(data.length);
  const pass = (src: Uint8ClampedArray, dest: Uint8ClampedArray, horiz: boolean) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let rs = 0;
        let gs = 0;
        let bs = 0;
        let n = 0;
        for (let k = -r; k <= r; k++) {
          const xx = horiz ? Math.min(w - 1, Math.max(0, x + k)) : x;
          const yy = horiz ? y : Math.min(h - 1, Math.max(0, y + k));
          const i = (yy * w + xx) * 4;
          rs += src[i] ?? 0;
          gs += src[i + 1] ?? 0;
          bs += src[i + 2] ?? 0;
          n++;
        }
        const o = (y * w + x) * 4;
        dest[o] = Math.round(rs / n);
        dest[o + 1] = Math.round(gs / n);
        dest[o + 2] = Math.round(bs / n);
        dest[o + 3] = 255;
      }
    }
  };
  pass(data, tmp, true);
  pass(tmp, out, false);
  return out;
}

export function drawSafeZone(data: Uint8ClampedArray, w: number, h: number, insetFrac = 0.07): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  const insetX = Math.round(w * insetFrac);
  const insetY = Math.round(h * insetFrac);
  const paint = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    out[i] = 0;
    out[i + 1] = 255;
    out[i + 2] = 80;
    out[i + 3] = 220;
  };
  for (let x = insetX; x < w - insetX; x++) {
    paint(x, insetY);
    paint(x, h - insetY);
  }
  for (let y = insetY; y < h - insetY; y++) {
    paint(insetX, y);
    paint(w - insetX, y);
  }
  return out;
}

export function drawRect(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  rw: number,
  rh: number,
  color: [number, number, number, number],
  fill = true,
): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(w, Math.round(x + rw));
  const y1 = Math.min(h, Math.round(y + rh));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      if (!fill && xx > x0 && xx < x1 - 1 && yy > y0 && yy < y1 - 1) continue;
      const i = (yy * w + xx) * 4;
      const a = color[3] / 255;
      data[i] = Math.round((data[i] ?? 0) * (1 - a) + color[0] * a);
      data[i + 1] = Math.round((data[i + 1] ?? 0) * (1 - a) + color[1] * a);
      data[i + 2] = Math.round((data[i + 2] ?? 0) * (1 - a) + color[2] * a);
      data[i + 3] = 255;
    }
  }
}

export function fillSolid(w: number, h: number, hex: string): { data: Uint8ClampedArray; width: number; height: number } {
  const [r, g, b] = hexToRgb(hex);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}

export function withBg(img: DecodedImage, hex?: string): DecodedImage {
  if (!hex) return img;
  const rgb = hexToRgb(hex);
  return { ...img, data: fillBackground(img.data, rgb) };
}

export function stem(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return base || 'file';
  return base.slice(0, dot) || 'file';
}

export function isVideoFile(file: NeoFile): boolean {
  return /^video\//.test(file.mime) || /\.(mp4|webm|mov|mkv|m4v|avi|ogv)$/i.test(file.name);
}

export function isAudioFile(file: NeoFile): boolean {
  return /^audio\//.test(file.mime) || /\.(mp3|wav|m4a|aac|ogg|opus|flac|aiff)$/i.test(file.name);
}

export function isImageFile(file: NeoFile): boolean {
  return /^image\//.test(file.mime) || /\.(png|jpe?g|webp|gif|avif|heic|bmp|tiff?)$/i.test(file.name);
}

export function isTextish(file: NeoFile): boolean {
  return /^(text\/|application\/(json|x-subrip))/.test(file.mime) || /\.(srt|vtt|ass|lrc|json|csv|txt)$/i.test(file.name);
}
