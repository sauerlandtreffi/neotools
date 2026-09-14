import { unzipSync, zipSync, gunzipSync, gzipSync, strToU8, strFromU8 } from 'fflate';
import { hasDoubleExtension, isExecutableName, safeRelPath } from './path-safe.js';

export interface ArchiveEntry {
  name: string;
  size: number;
  compressed?: number;
  ratio?: number;
  directory: boolean;
  suspicious: string[];
}

export const BOMB_RATIO = 100;
export const BOMB_UNCOMPRESSED = 80 * 1024 * 1024;

type FlateLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

function flateLevel(n: number): FlateLevel {
  return Math.max(0, Math.min(9, Math.round(n))) as FlateLevel;
}

export function createZip(files: Record<string, Uint8Array>, level = 6): Uint8Array {
  const safe: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(files)) {
    const rel = safeRelPath(name);
    if (!rel) throw new Error(`Zip-Slip / unsicherer Pfad: ${name}`);
    safe[rel] = data;
  }
  return zipSync(safe, { level: flateLevel(level) });
}

export function readZip(bytes: Uint8Array): { files: Record<string, Uint8Array>; blocked: string[]; warnings: string[] } {
  const files: Record<string, Uint8Array> = {};
  const blocked: string[] = [];
  const warnings: string[] = [];
  let unpacked = 0;
  const entries = unzipSync(bytes);
  for (const [name, data] of Object.entries(entries)) {
    const rel = safeRelPath(name);
    if (!rel) {
      blocked.push(name);
      continue;
    }
    unpacked += data.byteLength;
    if (unpacked > BOMB_UNCOMPRESSED) warnings.push('Zip-Bomb: unkomprimierte Größe über Schwelle.');
    const ratio = data.byteLength / Math.max(bytes.byteLength, 1);
    if (ratio > BOMB_RATIO) warnings.push(`Zip-Bomb-Ratio ${ratio.toFixed(1)}× für ${rel}`);
    files[rel] = data;
  }
  return { files, blocked, warnings };
}

export function inspectZip(bytes: Uint8Array): { entries: ArchiveEntry[]; comment: string; warnings: string[]; truncated: boolean } {
  const warnings: string[] = [];
  let truncated = false;
  let files: Record<string, Uint8Array> = {};
  try {
    files = unzipSync(bytes);
  } catch {
    truncated = true;
    warnings.push('ZIP unvollständig oder beschädigt (kein gültiges Directory).');
    return { entries: [], comment: '', warnings, truncated };
  }
  const entries: ArchiveEntry[] = Object.entries(files).map(([name, data]) => {
    const suspicious: string[] = [];
    if (!safeRelPath(name)) suspicious.push('zip-slip');
    if (isExecutableName(name)) suspicious.push('executable');
    if (hasDoubleExtension(name)) suspicious.push('double-ext');
    const ratio = data.byteLength / Math.max(1, bytes.byteLength / Math.max(Object.keys(files).length, 1));
    if (ratio > BOMB_RATIO) {
      suspicious.push('bomb-ratio');
      warnings.push(`Hohe Kompressionsrate bei ${name}`);
    }
    return {
      name,
      size: data.byteLength,
      compressed: undefined,
      ratio,
      directory: name.endsWith('/'),
      suspicious,
    };
  });
  return { entries, comment: '', warnings, truncated };
}

export function createTar(files: Record<string, Uint8Array>): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const [name, data] of Object.entries(files)) {
    const rel = safeRelPath(name);
    if (!rel) throw new Error(`Zip-Slip / unsicherer Pfad: ${name}`);
    chunks.push(tarHeader(rel, data.byteLength));
    chunks.push(data);
    const pad = (512 - (data.byteLength % 512)) % 512;
    if (pad) chunks.push(new Uint8Array(pad));
  }
  chunks.push(new Uint8Array(1024));
  const total = chunks.reduce((s, c) => s + c.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

export function readTar(bytes: Uint8Array): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  let i = 0;
  while (i + 512 <= bytes.length) {
    const header = bytes.subarray(i, i + 512);
    if (header.every((b) => b === 0)) break;
    const name = strFromU8(header.subarray(0, 100)).replace(/\0.*$/, '');
    const sizeOct = strFromU8(header.subarray(124, 136)).replace(/\0.*$/, '').trim();
    const size = parseInt(sizeOct, 8) || 0;
    i += 512;
    const rel = safeRelPath(name);
    if (rel && size >= 0) files[rel] = bytes.subarray(i, i + size);
    i += size + ((512 - (size % 512)) % 512);
  }
  return files;
}

export function createTarGz(files: Record<string, Uint8Array>, level = 6): Uint8Array {
  return gzipSync(createTar(files), { level: flateLevel(level) });
}

export function readTarGz(bytes: Uint8Array): Record<string, Uint8Array> {
  return readTar(gunzipSync(bytes));
}

function tarHeader(name: string, size: number): Uint8Array {
  const buf = new Uint8Array(512);
  const write = (off: number, s: string, len: number) => {
    const b = strToU8(s);
    buf.set(b.subarray(0, len), off);
  };
  write(0, name.slice(0, 100), 100);
  write(100, '0000644\0', 8);
  write(108, '0000000\0', 8);
  write(116, '0000000\0', 8);
  write(124, `${size.toString(8).padStart(11, '0')}\0`, 12);
  write(136, `${Math.floor(Date.now() / 1000).toString(8).padStart(11, '0')}\0`, 12);
  write(156, '0', 1);
  write(257, 'ustar\0', 6);
  write(263, '00', 2);
  buf.fill(0x20, 148, 156);
  let sum = 0;
  for (const b of buf) sum += b;
  write(148, `${sum.toString(8).padStart(6, '0')}\0 `, 8);
  return buf;
}

export function detectArchiveKind(bytes: Uint8Array, name: string): 'zip' | 'tar' | 'tgz' | '7z' | 'rar' | 'iso' | 'unknown' {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) return 'zip';
  if (bytes.length >= 6 && bytes[0] === 0x37 && bytes[1] === 0x7a && bytes[2] === 0xbc) return '7z';
  if (bytes.length >= 4 && bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72) return 'rar';
  if (bytes.length >= 3 && bytes[0] === 0x1f && bytes[1] === 0x8b) return 'tgz';
  if (/\.(tar\.gz|tgz)$/i.test(name)) return 'tgz';
  if (/\.tar$/i.test(name)) return 'tar';
  if (/\.iso$/i.test(name)) return 'iso';
  if (bytes.length > 265 && strFromU8(bytes.subarray(257, 262)) === 'ustar') return 'tar';
  return 'unknown';
}

export async function readAny(bytes: Uint8Array, name: string, password?: string): Promise<{ files: Record<string, Uint8Array>; warnings: string[]; blocked: string[] }> {
  const kind = detectArchiveKind(bytes, name);
  if (kind === 'zip') {
    if (password) {
      try {
        return await readZipPassword(bytes, password);
      } catch (err) {
        return { files: {}, warnings: [`Passwort-ZIP: ${err instanceof Error ? err.message : String(err)}`], blocked: [] };
      }
    }
    return readZip(bytes);
  }
  if (kind === 'tar') return { files: readTar(bytes), warnings: [], blocked: [] };
  if (kind === 'tgz') return { files: readTarGz(bytes), warnings: [], blocked: [] };
  return {
    files: {},
    warnings: [`Format ${kind} braucht libarchive.js (dynamisch, nicht gebündelt). ZIP/TAR/GZ sind nativ.`],
    blocked: [],
  };
}

async function readZipPassword(bytes: Uint8Array, password: string): Promise<{ files: Record<string, Uint8Array>; warnings: string[]; blocked: string[] }> {
  const zip = await import('@zip.js/zip.js');
  const reader = new zip.ZipReader(new zip.Uint8ArrayReader(bytes), { password });
  const entries = await reader.getEntries();
  const files: Record<string, Uint8Array> = {};
  const blocked: string[] = [];
  for (const entry of entries) {
    if (entry.directory) continue;
    const rel = safeRelPath(entry.filename);
    if (!rel) {
      blocked.push(entry.filename);
      continue;
    }
    const data = await entry.getData?.(new zip.Uint8ArrayWriter());
    if (data) files[rel] = data;
  }
  await reader.close();
  return { files, warnings: [], blocked };
}
