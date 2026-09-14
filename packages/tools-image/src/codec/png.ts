import { zlibSync, unzlibSync } from 'fflate';
import { decodePngRgba, parsePng } from '@neotools/parsers';
import { crc32, writeU32BE } from '@neotools/parsers';

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  writeU32BE(b, 0, n >>> 0);
  return b;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = new TextEncoder().encode(type);
  const body = new Uint8Array(t.length + data.length);
  body.set(t, 0);
  body.set(data, t.length);
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0);
  out.set(body, 4);
  writeU32BE(out, 8 + data.length, crc32(body));
  return out;
}

export function encodePngRgba(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  extras: Array<{ type: string; data: Uint8Array }> = [],
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
  const parts: Uint8Array[] = [sig, chunk('IHDR', ihdr)];
  for (const e of extras) parts.push(chunk(e.type, e.data));
  parts.push(chunk('IDAT', zlibSync(raw, { level: 6 })));
  parts.push(chunk('IEND', new Uint8Array()));
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

export function decodePng(bytes: Uint8Array): { width: number; height: number; data: Uint8ClampedArray } | undefined {
  return decodePngRgba(bytes);
}

export function pngIcc(bytes: Uint8Array): Uint8Array | undefined {
  const png = parsePng(bytes);
  if (!png) return undefined;
  const iccp = png.chunks.find((c) => c.type === 'iCCP');
  if (!iccp) return undefined;
  const data = bytes.subarray(iccp.offset + 8, iccp.offset + 8 + iccp.length);
  const z = data.indexOf(0);
  if (z < 0 || z + 2 >= data.length) return undefined;
  try {
    return unzlibSync(data.subarray(z + 2));
  } catch {
    return undefined;
  }
}

export function pngExif(bytes: Uint8Array): Uint8Array | undefined {
  const png = parsePng(bytes);
  const ex = png?.chunks.find((c) => c.type === 'eXIf');
  if (!ex) return undefined;
  return bytes.subarray(ex.offset + 8, ex.offset + 8 + ex.length);
}

export function makeIccpChunk(profile: Uint8Array, name = 'ICC Profile'): Uint8Array {
  const n = new TextEncoder().encode(name);
  const compressed = zlibSync(profile, { level: 6 });
  const data = new Uint8Array(n.length + 2 + compressed.length);
  data.set(n, 0);
  data[n.length] = 0;
  data[n.length + 1] = 0;
  data.set(compressed, n.length + 2);
  return data;
}

export function makeItxtChunk(key: string, value: string): Uint8Array {
  const k = new TextEncoder().encode(key);
  const v = new TextEncoder().encode(value);
  const data = new Uint8Array(k.length + 5 + v.length);
  data.set(k, 0);
  data[k.length] = 0;
  data[k.length + 1] = 0;
  data[k.length + 2] = 0;
  data[k.length + 3] = 0;
  data[k.length + 4] = 0;
  data.set(v, k.length + 5);
  return data;
}

export { parsePng };
