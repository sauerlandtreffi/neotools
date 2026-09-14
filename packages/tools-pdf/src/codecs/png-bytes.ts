import { zlibSync, unzlibSync } from 'fflate';

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i]!;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = new TextEncoder().encode(type);
  const body = new Uint8Array(t.length + data.length);
  body.set(t, 0);
  body.set(data, t.length);
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0);
  out.set(body, 4);
  out.set(u32(crc32(body)), 8 + data.length);
  return out;
}

/** Encode RGBA ImageData-like pixels as an 8-bit RGBA PNG. */
export function encodePngRgba(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
  const idat = chunk('IDAT', zlibSync(raw, { level: 6 }));
  const parts = [sig, chunk('IHDR', ihdr), idat, chunk('IEND', new Uint8Array())];
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function decodePngRgba(bytes: Uint8Array): { data: Uint8ClampedArray; width: number; height: number } {
  if (bytes[0] !== 137 || bytes[1] !== 80) throw new Error('Kein PNG.');
  let off = 8;
  let width = 0;
  let height = 0;
  let color = 0;
  const idats: Uint8Array[] = [];
  while (off + 8 <= bytes.length) {
    const len = (bytes[off]! << 24) | (bytes[off + 1]! << 16) | (bytes[off + 2]! << 8) | bytes[off + 3]!;
    const type = String.fromCharCode(bytes[off + 4]!, bytes[off + 5]!, bytes[off + 6]!, bytes[off + 7]!);
    const data = bytes.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = (data[0]! << 24) | (data[1]! << 16) | (data[2]! << 8) | data[3]!;
      height = (data[4]! << 24) | (data[5]! << 16) | (data[6]! << 8) | data[7]!;
      color = data[9]!;
    } else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  let total = 0;
  for (const d of idats) total += d.length;
  const packed = new Uint8Array(total);
  let p = 0;
  for (const d of idats) {
    packed.set(d, p);
    p += d.length;
  }
  const raw = unzlibSync(packed);
  const bpp = color === 6 ? 4 : color === 2 ? 3 : 1;
  const stride = width * bpp + 1;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = raw.subarray(y * stride + 1, (y + 1) * stride);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (bpp === 4) {
        out[o] = row[x * 4]!;
        out[o + 1] = row[x * 4 + 1]!;
        out[o + 2] = row[x * 4 + 2]!;
        out[o + 3] = row[x * 4 + 3]!;
      } else if (bpp === 3) {
        out[o] = row[x * 3]!;
        out[o + 1] = row[x * 3 + 1]!;
        out[o + 2] = row[x * 3 + 2]!;
        out[o + 3] = 255;
      } else {
        const g = row[x]!;
        out[o] = g;
        out[o + 1] = g;
        out[o + 2] = g;
        out[o + 3] = 255;
      }
    }
  }
  return { data: out, width, height };
}
