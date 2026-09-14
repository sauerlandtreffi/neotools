import { readU16LE, readU32LE, writeU16LE, writeU32LE } from '@neotools/parsers';
import { decodePng, encodePngRgba } from './png.js';
import { decodeBmp, encodeBmp } from './simple.js';
import { resample } from './resample.js';
import type { DecodedImage } from './types.js';
import { emptyMeta } from './types.js';

function andMask(width: number, height: number): Uint8Array {
  const row = ((width + 31) >> 5) << 2;
  return new Uint8Array(row * height);
}

export function encodeIco(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sizes: readonly number[] = [16, 32, 48],
): Uint8Array {
  const images: Uint8Array[] = [];
  for (const size of sizes) {
    const scaled =
      size === width && size === height
        ? { width, height, data }
        : resample(data, width, height, size, size, 'auto');
    const png = encodePngRgba(scaled.data, scaled.width, scaled.height);
    images.push(png);
  }
  const header = 6 + images.length * 16;
  let total = header;
  for (const img of images) total += img.length;
  const out = new Uint8Array(total);
  writeU16LE(out, 0, 0);
  writeU16LE(out, 2, 1);
  writeU16LE(out, 4, images.length);
  let offset = header;
  images.forEach((img, i) => {
    const size = sizes[i] ?? 16;
    const e = 6 + i * 16;
    out[e] = size >= 256 ? 0 : size;
    out[e + 1] = size >= 256 ? 0 : size;
    out[e + 2] = 0;
    out[e + 3] = 0;
    writeU16LE(out, e + 4, 1);
    writeU16LE(out, e + 6, 32);
    writeU32LE(out, e + 8, img.length);
    writeU32LE(out, e + 12, offset);
    out.set(img, offset);
    offset += img.length;
  });
  return out;
}

export function encodeIcoBmp(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const xor = encodeBmp(data, width, height, 32);
  const dib = xor.subarray(14);
  const mask = andMask(width, height);
  const pixel = new Uint8Array(dib.length + mask.length);
  pixel.set(dib, 0);
  writeU32LE(pixel, 8, height * 2);
  pixel.set(mask, dib.length);
  const out = new Uint8Array(22 + pixel.length);
  writeU16LE(out, 2, 1);
  writeU16LE(out, 4, 1);
  out[6] = width >= 256 ? 0 : width;
  out[7] = height >= 256 ? 0 : height;
  writeU16LE(out, 10, 1);
  writeU16LE(out, 12, 32);
  writeU32LE(out, 14, pixel.length);
  writeU32LE(out, 18, 22);
  out.set(pixel, 22);
  return out;
}

export function decodeIco(bytes: Uint8Array): DecodedImage {
  if (bytes.length < 6) throw new Error('Kein ICO.');
  const type = readU16LE(bytes, 2);
  const count = readU16LE(bytes, 4);
  if (type !== 1 && type !== 2) throw new Error('Kein ICO/CUR.');
  let best: { w: number; h: number; offset: number; size: number } | undefined;
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    const w = bytes[e] === 0 ? 256 : (bytes[e] ?? 0);
    const h = bytes[e + 1] === 0 ? 256 : (bytes[e + 1] ?? 0);
    const size = readU32LE(bytes, e + 8);
    const offset = readU32LE(bytes, e + 12);
    if (!best || w * h > best.w * best.h) best = { w, h, offset, size };
  }
  if (!best) throw new Error('ICO ohne Bilder.');
  const slice = bytes.subarray(best.offset, best.offset + best.size);
  if (slice[0] === 0x89 && slice[1] === 0x50) {
    const png = decodePng(slice);
    if (!png) throw new Error('PNG-in-ICO unlesbar.');
    return { ...png, meta: emptyMeta('ico') };
  }
  const fake = new Uint8Array(14 + slice.length);
  fake[0] = 0x42;
  fake[1] = 0x4d;
  writeU32LE(fake, 2, fake.length);
  writeU32LE(fake, 10, 14);
  fake.set(slice, 14);
  const hdrH = readU32LE(slice, 8);
  if (hdrH === best.h * 2) writeU32LE(fake, 14 + 8, best.h);
  const bmp = decodeBmp(fake);
  return { width: bmp.width, height: bmp.height, data: bmp.data, meta: emptyMeta('ico') };
}
