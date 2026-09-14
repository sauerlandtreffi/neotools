export function hex(bytes: Uint8Array, max = bytes.length): string {
  const n = Math.min(bytes.length, max);
  let out = '';
  for (let i = 0; i < n; i++) out += bytes[i]!.toString(16).padStart(2, '0');
  return out;
}

export function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  const end = Math.min(bytes.length, offset + length);
  let s = '';
  for (let i = offset; i < end; i++) {
    const b = bytes[i]!;
    s += b >= 32 && b < 127 ? String.fromCharCode(b) : '.';
  }
  return s;
}

export function latin1(bytes: Uint8Array, offset = 0, length = bytes.length - offset): string {
  const end = Math.min(bytes.length, offset + length);
  let s = '';
  for (let i = offset; i < end; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

export function cstr(bytes: Uint8Array, offset: number, max = 256): string {
  let s = '';
  const end = Math.min(bytes.length, offset + max);
  for (let i = offset; i < end; i++) {
    const b = bytes[i]!;
    if (b === 0) break;
    s += String.fromCharCode(b);
  }
  return s;
}

export function eqAt(bytes: Uint8Array, offset: number, sig: readonly number[] | Uint8Array | string): boolean {
  const needle = typeof sig === 'string' ? utf8(sig) : sig;
  if (offset < 0 || offset + needle.length > bytes.length) return false;
  for (let i = 0; i < needle.length; i++) {
    if (bytes[offset + i] !== needle[i]) return false;
  }
  return true;
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function fromUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function readU16BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

export function readU16LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

export function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000 +
      ((bytes[offset + 1] ?? 0) << 16) +
      ((bytes[offset + 2] ?? 0) << 8) +
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

export function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

export function readI32BE(bytes: Uint8Array, offset: number): number {
  return readU32BE(bytes, offset) | 0;
}

export function writeU16BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

export function writeU16LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
}

export function writeU32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

export function writeU32BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >> 16) & 0xff;
  bytes[offset + 2] = (value >> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

export function findBytes(haystack: Uint8Array, needle: Uint8Array | readonly number[], from = 0, limit?: number): number {
  const n = needle.length;
  if (!n) return from;
  const last = limit === undefined ? haystack.length : Math.min(haystack.length, from + limit);
  outer: for (let i = from; i <= last - n; i++) {
    for (let j = 0; j < n; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

export function findAllBytes(
  haystack: Uint8Array,
  needle: Uint8Array | readonly number[],
  maxHits = 32,
  from = 0,
): number[] {
  const hits: number[] = [];
  let pos = from;
  while (hits.length < maxHits) {
    const i = findBytes(haystack, needle, pos);
    if (i < 0) break;
    hits.push(i);
    pos = i + 1;
  }
  return hits;
}

export function findAscii(haystack: Uint8Array, text: string, from = 0): number {
  return findBytes(haystack, utf8(text), from);
}

export function fourcc(bytes: Uint8Array, offset: number): string {
  return latin1(bytes, offset, 4);
}

export function extensionOf(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot).toLowerCase();
}

export function stemOf(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return base || 'output';
  return base.slice(0, dot) || 'output';
}

export const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array, seed = 0xffffffff): number {
  let c = seed;
  for (let i = 0; i < data.length; i++) {
    c = CRC32_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
