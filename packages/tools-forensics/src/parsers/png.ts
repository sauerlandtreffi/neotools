import { decompressSync } from 'fflate';
import { eqAt, fourcc, readU32BE } from '../util/bytes.js';

export interface PngChunk {
  type: string;
  offset: number;
  length: number;
  crc: number;
  text?: string;
}

export interface PngAutopsy {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  chunks: PngChunk[];
  texts: Array<{ key: string; value: string }>;
  hasExif: boolean;
  bytesAfterIend: number;
  iendOffset: number;
}

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export function parsePng(bytes: Uint8Array): PngAutopsy | undefined {
  if (!eqAt(bytes, 0, SIG)) return undefined;
  const chunks: PngChunk[] = [];
  const texts: Array<{ key: string; value: string }> = [];
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let hasExif = false;
  let iendOffset = -1;
  let i = 8;
  while (i + 12 <= bytes.length) {
    const length = readU32BE(bytes, i);
    const type = fourcc(bytes, i + 4);
    const dataOff = i + 8;
    if (dataOff + length + 4 > bytes.length) break;
    const data = bytes.subarray(dataOff, dataOff + length);
    const crc = readU32BE(bytes, dataOff + length);
    const chunk: PngChunk = { type, offset: i, length, crc };
    if (type === 'IHDR' && data.length >= 13) {
      width = readU32BE(data, 0);
      height = readU32BE(data, 4);
      bitDepth = data[8]!;
      colorType = data[9]!;
    }
    if (type === 'tEXt') {
      const z = data.indexOf(0);
      if (z >= 0) {
        const key = new TextDecoder().decode(data.subarray(0, z));
        const value = new TextDecoder('latin1').decode(data.subarray(z + 1));
        texts.push({ key, value });
        chunk.text = `${key}=${value.slice(0, 80)}`;
      }
    }
    if (type === 'iTXt') {
      const z = data.indexOf(0);
      if (z >= 0) {
        const key = new TextDecoder().decode(data.subarray(0, z));
        texts.push({ key, value: new TextDecoder('utf-8', { fatal: false }).decode(data.subarray(z + 1)).slice(0, 200) });
        chunk.text = key;
      }
    }
    if (type === 'eXIf') hasExif = true;
    chunks.push(chunk);
    if (type === 'IEND') {
      iendOffset = i;
      i += 12 + length;
      break;
    }
    i += 12 + length;
  }
  const end = iendOffset >= 0 ? iendOffset + 12 : bytes.length;
  return {
    width,
    height,
    bitDepth,
    colorType,
    chunks,
    texts,
    hasExif,
    bytesAfterIend: Math.max(0, bytes.length - end),
    iendOffset,
  };
}

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Decode 8-bit RGB/RGBA/grayscale/indexed PNG (no interlace) — reusable for image-metadata. */
export function decodePngRgba(bytes: Uint8Array): RgbaImage | undefined {
  const png = parsePng(bytes);
  if (!png || png.width <= 0 || png.height <= 0) return undefined;
  if (png.bitDepth !== 8) return undefined;
  const ihdr = png.chunks.find((c) => c.type === 'IHDR');
  if (!ihdr) return undefined;
  const interlace = bytes[ihdr.offset + 8 + 12];
  if (interlace) return undefined;
  const idats: Uint8Array[] = [];
  let palette: Uint8Array | undefined;
  for (const c of png.chunks) {
    if (c.type === 'IDAT') idats.push(bytes.subarray(c.offset + 8, c.offset + 8 + c.length));
    if (c.type === 'PLTE') palette = bytes.subarray(c.offset + 8, c.offset + 8 + c.length);
  }
  let total = 0;
  for (const d of idats) total += d.length;
  const raw = new Uint8Array(total);
  let o = 0;
  for (const d of idats) {
    raw.set(d, o);
    o += d.length;
  }
  let inflated: Uint8Array;
  try {
    inflated = decompressSync(raw);
  } catch {
    return undefined;
  }
  const { width, height, colorType } = png;
  const bpp = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 0 ? 1 : colorType === 4 ? 2 : colorType === 3 ? 1 : 0;
  if (!bpp) return undefined;
  const stride = width * bpp;
  const out = new Uint8ClampedArray(width * height * 4);
  let src = 0;
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = inflated[src] ?? 0;
    src += 1;
    const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const v = inflated[src + x] ?? 0;
      const a = x >= bpp ? row[x - bpp]! : 0;
      const b = prev[x]!;
      const c = x >= bpp ? prev[x - bpp]! : 0;
      let rec = v;
      if (filter === 1) rec = (v + a) & 0xff;
      else if (filter === 2) rec = (v + b) & 0xff;
      else if (filter === 3) rec = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) rec = (v + paeth(a, b, c)) & 0xff;
      row[x] = rec;
    }
    src += stride;
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      if (colorType === 2) {
        out[di] = row[x * 3]!;
        out[di + 1] = row[x * 3 + 1]!;
        out[di + 2] = row[x * 3 + 2]!;
        out[di + 3] = 255;
      } else if (colorType === 6) {
        out[di] = row[x * 4]!;
        out[di + 1] = row[x * 4 + 1]!;
        out[di + 2] = row[x * 4 + 2]!;
        out[di + 3] = row[x * 4 + 3]!;
      } else if (colorType === 0) {
        const g = row[x]!;
        out[di] = g;
        out[di + 1] = g;
        out[di + 2] = g;
        out[di + 3] = 255;
      } else if (colorType === 3 && palette) {
        const idx = row[x]! * 3;
        out[di] = palette[idx] ?? 0;
        out[di + 1] = palette[idx + 1] ?? 0;
        out[di + 2] = palette[idx + 2] ?? 0;
        out[di + 3] = 255;
      }
    }
    prev = row;
  }
  return { width, height, data: out };
}
