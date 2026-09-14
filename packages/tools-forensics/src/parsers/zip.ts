import { inflateSync } from 'fflate';
import { eqAt, findBytes, latin1, readU16LE, readU32LE } from '../util/bytes.js';

export interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  crc: number;
  localOffset: number;
  extraLength: number;
  comment: string;
}

export interface ZipInfo {
  entries: ZipEntry[];
  comment: string;
  eocdOffset: number;
  eocdSize: number;
  bytesAfterEocd: number;
  zip64: boolean;
}

const EOCD = [0x50, 0x4b, 0x05, 0x06] as const;
const ZIP64_EOCD = [0x50, 0x4b, 0x06, 0x06] as const;
const CD = [0x50, 0x4b, 0x01, 0x02] as const;
const LH = [0x50, 0x4b, 0x03, 0x04] as const;

export function findEocd(bytes: Uint8Array): number {
  const min = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= min; i--) {
    if (!eqAt(bytes, i, EOCD)) continue;
    const commentLen = readU16LE(bytes, i + 20);
    if (i + 22 + commentLen <= bytes.length) return i;
  }
  return -1;
}

export function listZipEntries(bytes: Uint8Array, maxEntries = 512): ZipInfo {
  const eocd = findEocd(bytes);
  if (eocd < 0) {
    return walkLocalHeaders(bytes, maxEntries);
  }
  const commentLen = readU16LE(bytes, eocd + 20);
  const comment = latin1(bytes, eocd + 22, commentLen);
  const cdOffset = readU32LE(bytes, eocd + 16);
  const cdSize = readU32LE(bytes, eocd + 12);
  const total = readU16LE(bytes, eocd + 10);
  const zip64 = findBytes(bytes, ZIP64_EOCD, Math.max(0, eocd - 128), 128) >= 0;
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  const cdEnd = Math.min(bytes.length, cdOffset + cdSize);
  const n = Math.min(total || maxEntries, maxEntries);
  while (p + 46 <= cdEnd && entries.length < n) {
    if (!eqAt(bytes, p, CD)) break;
    const method = readU16LE(bytes, p + 10);
    const crc = readU32LE(bytes, p + 16);
    const compressedSize = readU32LE(bytes, p + 20);
    const uncompressedSize = readU32LE(bytes, p + 24);
    const nameLen = readU16LE(bytes, p + 28);
    const extraLen = readU16LE(bytes, p + 30);
    const commentL = readU16LE(bytes, p + 32);
    const localOffset = readU32LE(bytes, p + 42);
    const name = decodeName(bytes, p + 46, nameLen);
    const eComment = latin1(bytes, p + 46 + nameLen + extraLen, commentL);
    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      method,
      crc,
      localOffset,
      extraLength: extraLen,
      comment: eComment,
    });
    p += 46 + nameLen + extraLen + commentL;
  }
  const eocdSize = 22 + commentLen;
  return {
    entries,
    comment,
    eocdOffset: eocd,
    eocdSize,
    bytesAfterEocd: Math.max(0, bytes.length - (eocd + eocdSize)),
    zip64,
  };
}

function walkLocalHeaders(bytes: Uint8Array, maxEntries: number): ZipInfo {
  const entries: ZipEntry[] = [];
  let p = 0;
  while (p + 30 <= bytes.length && entries.length < maxEntries) {
    if (!eqAt(bytes, p, LH)) break;
    const method = readU16LE(bytes, p + 8);
    const crc = readU32LE(bytes, p + 14);
    const compressedSize = readU32LE(bytes, p + 18);
    const uncompressedSize = readU32LE(bytes, p + 22);
    const nameLen = readU16LE(bytes, p + 26);
    const extraLen = readU16LE(bytes, p + 28);
    const name = decodeName(bytes, p + 30, nameLen);
    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      method,
      crc,
      localOffset: p,
      extraLength: extraLen,
      comment: '',
    });
    p += 30 + nameLen + extraLen + compressedSize;
  }
  return {
    entries,
    comment: '',
    eocdOffset: -1,
    eocdSize: 0,
    bytesAfterEocd: 0,
    zip64: false,
  };
}

function decodeName(bytes: Uint8Array, offset: number, len: number): string {
  const slice = bytes.subarray(offset, offset + len);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(slice);
  } catch {
    return latin1(slice);
  }
}

export function localDataStart(bytes: Uint8Array, entry: ZipEntry): number {
  const off = entry.localOffset;
  if (!eqAt(bytes, off, LH)) return off + 30 + entry.name.length + entry.extraLength;
  const nameLen = readU16LE(bytes, off + 26);
  const extraLen = readU16LE(bytes, off + 28);
  return off + 30 + nameLen + extraLen;
}

export function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Uint8Array {
  const start = localDataStart(bytes, entry);
  const compressed = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return inflateSync(compressed);
  throw new Error(`ZIP-Methode ${entry.method} nicht unterstützt (${entry.name}).`);
}

export function readZipText(bytes: Uint8Array, name: string): string | undefined {
  const { entries } = listZipEntries(bytes);
  const entry = entries.find((e) => e.name === name || e.name.replace(/\\/g, '/') === name);
  if (!entry) return undefined;
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(readZipEntry(bytes, entry));
  } catch {
    return undefined;
  }
}

export function zipHas(bytes: Uint8Array, pred: (name: string) => boolean): boolean {
  return listZipEntries(bytes).entries.some((e) => pred(e.name.replace(/\\/g, '/')));
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function zipCrc(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(b: Uint8Array, o: number, v: number): void {
  b[o] = v & 0xff;
  b[o + 1] = (v >> 8) & 0xff;
}

function u32(b: Uint8Array, o: number, v: number): void {
  b[o] = v & 0xff;
  b[o + 1] = (v >> 8) & 0xff;
  b[o + 2] = (v >> 16) & 0xff;
  b[o + 3] = (v >>> 24) & 0xff;
}

export function buildStoreZip(files: Record<string, string | Uint8Array>, comment = ''): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const commentBytes = enc.encode(comment);
  for (const [name, body] of Object.entries(files)) {
    const data = typeof body === 'string' ? enc.encode(body) : body;
    const nameBytes = enc.encode(name);
    const crc = zipCrc(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    local[0] = 0x50;
    local[1] = 0x4b;
    local[2] = 0x03;
    local[3] = 0x04;
    u16(local, 4, 20);
    u32(local, 14, crc);
    u32(local, 18, data.length);
    u32(local, 22, data.length);
    u16(local, 26, nameBytes.length);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const cd = new Uint8Array(46 + nameBytes.length);
    cd[0] = 0x50;
    cd[1] = 0x4b;
    cd[2] = 0x01;
    cd[3] = 0x02;
    u16(cd, 4, 20);
    u16(cd, 6, 20);
    u32(cd, 16, crc);
    u32(cd, 20, data.length);
    u32(cd, 24, data.length);
    u16(cd, 28, nameBytes.length);
    u32(cd, 42, offset);
    cd.set(nameBytes, 46);
    centrals.push(cd);
    offset += local.length;
  }
  let cdLen = 0;
  for (const c of centrals) cdLen += c.length;
  const cdBlob = new Uint8Array(cdLen);
  let o = 0;
  for (const c of centrals) {
    cdBlob.set(c, o);
    o += c.length;
  }
  const eocd = new Uint8Array(22 + commentBytes.length);
  eocd[0] = 0x50;
  eocd[1] = 0x4b;
  eocd[2] = 0x05;
  eocd[3] = 0x06;
  u16(eocd, 8, centrals.length);
  u16(eocd, 10, centrals.length);
  u32(eocd, 12, cdBlob.length);
  u32(eocd, 16, offset);
  u16(eocd, 20, commentBytes.length);
  eocd.set(commentBytes, 22);
  let total = cdBlob.length + eocd.length;
  for (const l of locals) total += l.length;
  const out = new Uint8Array(total);
  o = 0;
  for (const l of locals) {
    out.set(l, o);
    o += l.length;
  }
  out.set(cdBlob, o);
  o += cdBlob.length;
  out.set(eocd, o);
  return out;
}
