import { readU16LE, readU32LE, writeU16LE, writeU32LE } from '@neotools/parsers';
import type { DecodedImage } from './types.js';
import { emptyMeta } from './types.js';
import { luma } from './pixels.js';

function decoded(width: number, height: number, data: Uint8ClampedArray, format: 'bmp' | 'tga' | 'ppm' | 'pgm' | 'pbm'): DecodedImage {
  return { width, height, data, meta: emptyMeta(format) };
}

export function encodeBmp(data: Uint8ClampedArray, width: number, height: number, bpp = 32): Uint8Array {
  const rowBytes = bpp === 32 ? width * 4 : ((width * 3 + 3) & ~3);
  const pixelSize = rowBytes * height;
  const offBits = 14 + 40;
  const out = new Uint8Array(offBits + pixelSize);
  out[0] = 0x42;
  out[1] = 0x4d;
  writeU32LE(out, 2, out.length);
  writeU32LE(out, 10, offBits);
  writeU32LE(out, 14, 40);
  writeU32LE(out, 18, width);
  writeU32LE(out, 22, height);
  writeU16LE(out, 26, 1);
  writeU16LE(out, 28, bpp);
  writeU32LE(out, 34, pixelSize);
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y;
    const dest = offBits + y * rowBytes;
    for (let x = 0; x < width; x++) {
      const si = (srcY * width + x) * 4;
      if (bpp === 32) {
        out[dest + x * 4] = data[si + 2]!;
        out[dest + x * 4 + 1] = data[si + 1]!;
        out[dest + x * 4 + 2] = data[si]!;
        out[dest + x * 4 + 3] = data[si + 3]!;
      } else {
        out[dest + x * 3] = data[si + 2]!;
        out[dest + x * 3 + 1] = data[si + 1]!;
        out[dest + x * 3 + 2] = data[si]!;
      }
    }
  }
  return out;
}

export function decodeBmp(bytes: Uint8Array): DecodedImage {
  if (bytes[0] !== 0x42 || bytes[1] !== 0x4d) throw new Error('Kein BMP.');
  const offBits = readU32LE(bytes, 10);
  const hdr = readU32LE(bytes, 14);
  const width = readU32LE(bytes, 18) | 0;
  let height = readU32LE(bytes, 22) | 0;
  const topDown = height < 0;
  height = Math.abs(height);
  const bpp = readU16LE(bytes, 28);
  const compression = hdr >= 20 ? readU32LE(bytes, 30) : 0;
  if (compression !== 0 && compression !== 3) throw new Error('BMP-Kompression nicht unterstützt.');
  const rowBytes = ((width * bpp + 31) >> 5) << 2;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcY = topDown ? y : height - 1 - y;
    const row = offBits + srcY * rowBytes;
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      if (bpp === 32) {
        data[di] = bytes[row + x * 4 + 2] ?? 0;
        data[di + 1] = bytes[row + x * 4 + 1] ?? 0;
        data[di + 2] = bytes[row + x * 4] ?? 0;
        data[di + 3] = bytes[row + x * 4 + 3] ?? 255;
      } else if (bpp === 24) {
        data[di] = bytes[row + x * 3 + 2] ?? 0;
        data[di + 1] = bytes[row + x * 3 + 1] ?? 0;
        data[di + 2] = bytes[row + x * 3] ?? 0;
        data[di + 3] = 255;
      } else if (bpp === 16) {
        const v = readU16LE(bytes, row + x * 2);
        data[di] = ((v >> 10) & 31) * 8;
        data[di + 1] = ((v >> 5) & 31) * 8;
        data[di + 2] = (v & 31) * 8;
        data[di + 3] = 255;
      } else if (bpp === 8) {
        const g = bytes[row + x] ?? 0;
        data[di] = g;
        data[di + 1] = g;
        data[di + 2] = g;
        data[di + 3] = 255;
      } else if (bpp === 1) {
        const bit = (bytes[row + (x >> 3)] ?? 0) & (0x80 >> (x & 7));
        const v = bit ? 255 : 0;
        data[di] = v;
        data[di + 1] = v;
        data[di + 2] = v;
        data[di + 3] = 255;
      } else {
        throw new Error(`BMP ${bpp} bpp nicht unterstützt.`);
      }
    }
  }
  return decoded(width, height, data, 'bmp');
}

export function encodeTga(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const out = new Uint8Array(18 + width * height * 4);
  out[2] = 2;
  writeU16LE(out, 12, width);
  writeU16LE(out, 14, height);
  out[16] = 32;
  out[17] = 8 | 32;
  let o = 18;
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const si = (srcY * width + x) * 4;
      out[o++] = data[si + 2]!;
      out[o++] = data[si + 1]!;
      out[o++] = data[si]!;
      out[o++] = data[si + 3]!;
    }
  }
  return out;
}

export function decodeTga(bytes: Uint8Array): DecodedImage {
  if (bytes.length < 18) throw new Error('Kein TGA.');
  const idLen = bytes[0] ?? 0;
  const imgType = bytes[2] ?? 0;
  const width = readU16LE(bytes, 12);
  const height = readU16LE(bytes, 14);
  const bpp = bytes[16] ?? 0;
  const desc = bytes[17] ?? 0;
  const topDown = (desc & 32) !== 0;
  if (imgType !== 2 && imgType !== 3) throw new Error('Nur unkomprimiertes TGA.');
  const srcOff = 18 + idLen;
  const spp = bpp === 32 ? 4 : bpp === 24 ? 3 : bpp === 8 ? 1 : 0;
  if (!spp) throw new Error(`TGA ${bpp} bpp nicht unterstützt.`);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcY = topDown ? y : height - 1 - y;
    for (let x = 0; x < width; x++) {
      const si = srcOff + (srcY * width + x) * spp;
      const di = (y * width + x) * 4;
      if (spp === 1) {
        const g = bytes[si] ?? 0;
        data[di] = g;
        data[di + 1] = g;
        data[di + 2] = g;
        data[di + 3] = 255;
      } else {
        data[di] = bytes[si + 2] ?? 0;
        data[di + 1] = bytes[si + 1] ?? 0;
        data[di + 2] = bytes[si] ?? 0;
        data[di + 3] = spp === 4 ? (bytes[si + 3] ?? 255) : 255;
      }
    }
  }
  return decoded(width, height, data, 'tga');
}

function parseNetpbmHeader(bytes: Uint8Array): { magic: string; width: number; height: number; maxv: number; offset: number } {
  const text = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 512)));
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length && tokens.length < 8) {
    while (i < text.length && /[\s]/.test(text[i]!)) i += 1;
    if (text[i] === '#') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    let t = '';
    while (i < text.length && !/[\s]/.test(text[i]!)) t += text[i++];
    if (t) tokens.push(t);
  }
  const magic = tokens[0] ?? '';
  const width = Number(tokens[1]);
  const height = Number(tokens[2]);
  const binary = magic === 'P4' || magic === 'P5' || magic === 'P6';
  const maxv = magic === 'P1' || magic === 'P4' ? 1 : Number(tokens[3] ?? 255);
  let offset = 0;
  if (binary) {
    const need = magic === 'P4' ? 3 : 4;
    let seen = 0;
    let pos = 0;
    while (pos < bytes.length && seen < need) {
      if (bytes[pos] === 0x23) {
        while (pos < bytes.length && bytes[pos] !== 0x0a) pos += 1;
        pos += 1;
        continue;
      }
      if (bytes[pos]! > 32) {
        while (pos < bytes.length && (bytes[pos] ?? 0) > 32) pos += 1;
        seen += 1;
      } else pos += 1;
    }
    while (pos < bytes.length && (bytes[pos] === 0x20 || bytes[pos] === 0x09 || bytes[pos] === 0x0d)) pos += 1;
    if (bytes[pos] === 0x0a) pos += 1;
    offset = pos;
  } else {
    offset = 0;
  }
  return { magic, width, height, maxv, offset };
}

export function decodePpm(bytes: Uint8Array): DecodedImage {
  const h = parseNetpbmHeader(bytes);
  if (!['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].includes(h.magic)) throw new Error('Kein PNM.');
  const data = new Uint8ClampedArray(h.width * h.height * 4);
  const scale = h.maxv > 0 ? 255 / h.maxv : 1;
  if (h.magic === 'P6') {
    let o = h.offset;
    for (let i = 0; i < h.width * h.height; i++) {
      data[i * 4] = Math.round((bytes[o++] ?? 0) * scale);
      data[i * 4 + 1] = Math.round((bytes[o++] ?? 0) * scale);
      data[i * 4 + 2] = Math.round((bytes[o++] ?? 0) * scale);
      data[i * 4 + 3] = 255;
    }
    return decoded(h.width, h.height, data, 'ppm');
  }
  if (h.magic === 'P5') {
    let o = h.offset;
    for (let i = 0; i < h.width * h.height; i++) {
      const g = Math.round((bytes[o++] ?? 0) * scale);
      data[i * 4] = g;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = g;
      data[i * 4 + 3] = 255;
    }
    return decoded(h.width, h.height, data, 'pgm');
  }
  if (h.magic === 'P4') {
    const rowBytes = Math.ceil(h.width / 8);
    for (let y = 0; y < h.height; y++) {
      for (let x = 0; x < h.width; x++) {
        const bit = (bytes[h.offset + y * rowBytes + (x >> 3)] ?? 0) & (0x80 >> (x & 7));
        const v = bit ? 0 : 255;
        const di = (y * h.width + x) * 4;
        data[di] = v;
        data[di + 1] = v;
        data[di + 2] = v;
        data[di + 3] = 255;
      }
    }
    return decoded(h.width, h.height, data, 'pbm');
  }
  const text = new TextDecoder('latin1').decode(bytes);
  const nums: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cut = line.split('#')[0] ?? '';
    for (const t of cut.trim().split(/\s+/)) {
      if (t && !/^P[1-6]$/.test(t)) nums.push(Number(t));
    }
  }
  let i = 2;
  if (h.magic !== 'P1') i = 3;
  for (let p = 0; p < h.width * h.height; p++) {
    if (h.magic === 'P3') {
      data[p * 4] = Math.round((nums[i++] ?? 0) * scale);
      data[p * 4 + 1] = Math.round((nums[i++] ?? 0) * scale);
      data[p * 4 + 2] = Math.round((nums[i++] ?? 0) * scale);
      data[p * 4 + 3] = 255;
    } else if (h.magic === 'P2') {
      const g = Math.round((nums[i++] ?? 0) * scale);
      data[p * 4] = g;
      data[p * 4 + 1] = g;
      data[p * 4 + 2] = g;
      data[p * 4 + 3] = 255;
    } else {
      const v = (nums[i++] ?? 0) ? 0 : 255;
      data[p * 4] = v;
      data[p * 4 + 1] = v;
      data[p * 4 + 2] = v;
      data[p * 4 + 3] = 255;
    }
  }
  const format = h.magic === 'P3' ? 'ppm' : h.magic === 'P2' ? 'pgm' : 'pbm';
  return decoded(h.width, h.height, data, format);
}

export function encodePpm(data: Uint8ClampedArray, width: number, height: number, kind: 'ppm' | 'pgm' | 'pbm' = 'ppm'): Uint8Array {
  if (kind === 'ppm') {
    const header = new TextEncoder().encode(`P6\n${width} ${height}\n255\n`);
    const body = new Uint8Array(width * height * 3);
    for (let i = 0, o = 0; i < width * height; i++, o += 3) {
      body[o] = data[i * 4]!;
      body[o + 1] = data[i * 4 + 1]!;
      body[o + 2] = data[i * 4 + 2]!;
    }
    const out = new Uint8Array(header.length + body.length);
    out.set(header, 0);
    out.set(body, header.length);
    return out;
  }
  if (kind === 'pgm') {
    const header = new TextEncoder().encode(`P5\n${width} ${height}\n255\n`);
    const body = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      body[i] = Math.round(luma(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!));
    }
    const out = new Uint8Array(header.length + body.length);
    out.set(header, 0);
    out.set(body, header.length);
    return out;
  }
  const header = new TextEncoder().encode(`P4\n${width} ${height}\n`);
  const rowBytes = Math.ceil(width / 8);
  const body = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const on = luma(data[i]!, data[i + 1]!, data[i + 2]!) < 128;
      if (on) body[y * rowBytes + (x >> 3)] = (body[y * rowBytes + (x >> 3)] ?? 0) | (0x80 >> (x & 7));
    }
  }
  const out = new Uint8Array(header.length + body.length);
  out.set(header, 0);
  out.set(body, header.length);
  return out;
}
