import { Gunzip, unzipSync, zipSync, gzipSync, strToU8, strFromU8 } from 'fflate';
import { collisionKey, hasDoubleExtension, isExecutableName, safeRelPath } from './path-safe.js';

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

/** Thrown before any inflate when the central directory already announces a bomb. */
export class ArchiveBombError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveBombError';
  }
}

/** Nested archives are never expanded recursively — depth is always 0 (documented limit). */
export const MAX_NESTING_DEPTH = 0;

/** Decompress gzip with a hard output cap; aborts mid-stream instead of allocating the bomb. */
export function gunzipLimited(bytes: Uint8Array, maxBytes = BOMB_UNCOMPRESSED): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const g = new Gunzip((chunk) => {
    total += chunk.byteLength;
    if (total > maxBytes || total / Math.max(bytes.byteLength, 1) > BOMB_RATIO) {
      throw new ArchiveBombError('Gzip-Bomb: Ausgabe über Schwelle — Abbruch.');
    }
    chunks.push(chunk);
  });
  g.push(bytes, true);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

export function readZip(bytes: Uint8Array): { files: Record<string, Uint8Array>; blocked: string[]; warnings: string[] } {
  const files: Record<string, Uint8Array> = {};
  const blocked: string[] = [];
  const warnings: string[] = [];
  const used = new Map<string, string>();
  let unpacked = 0;
  // Pre-inflate gate: central-directory sizes are checked before a single byte is decompressed.
  let announced = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (info) => {
        announced += info.originalSize;
        const ratio = info.originalSize / Math.max(info.size, 1);
        if (announced > BOMB_UNCOMPRESSED) throw new ArchiveBombError('Zip-Bomb: angekündigte Gesamtgröße über Schwelle — Abbruch.');
        if (info.originalSize > 1024 * 1024 && ratio > BOMB_RATIO) {
          throw new ArchiveBombError(`Zip-Bomb-Ratio ${ratio.toFixed(0)}× für ${info.name} — Abbruch.`);
        }
        return true;
      },
    });
  } catch (err) {
    if (err instanceof ArchiveBombError) {
      return { files: {}, blocked: [], warnings: [err.message] };
    }
    throw err;
  }
  for (const [name, data] of Object.entries(entries)) {
    const rel = safeRelPath(name);
    if (!rel) {
      blocked.push(name);
      continue;
    }
    const key = collisionKey(rel);
    if (used.has(key) && used.get(key) !== rel) {
      blocked.push(name);
      warnings.push(`Pfad-Kollision (Unicode/Case): ${rel}`);
      continue;
    }
    unpacked += data.byteLength;
    const ratio = data.byteLength / Math.max(bytes.byteLength, 1);
    if (unpacked > BOMB_UNCOMPRESSED || ratio > BOMB_RATIO) {
      warnings.push(
        unpacked > BOMB_UNCOMPRESSED
          ? 'Zip-Bomb: unkomprimierte Größe über Schwelle — Abbruch.'
          : `Zip-Bomb-Ratio ${ratio.toFixed(1)}× für ${rel} — Abbruch.`,
      );
      return { files: {}, blocked: [...blocked, ...Object.keys(entries)], warnings };
    }
    if (looksLikeNestedArchive(data, rel)) warnings.push(`Verschachteltes Archiv: ${rel} (wird nicht rekursiv entpackt).`);
    used.set(key, rel);
    files[rel] = data;
  }
  return { files, blocked, warnings };
}

function looksLikeNestedArchive(data: Uint8Array, name: string): boolean {
  if (data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b) return true;
  if (data.length >= 3 && data[0] === 0x1f && data[1] === 0x8b) return true;
  return /\.(zip|tar|tgz|7z|rar)$/i.test(name);
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

/**
 * TAR reader. Only regular files ('0', NUL, '7') are returned; symlinks (2),
 * hardlinks (1), devices (3/4), FIFOs (6), GNU long-name/link (K/L) and PAX
 * headers (x/g) are skipped. The ustar `prefix` field is joined so `..` hidden
 * in the prefix cannot bypass `safeRelPath`. Total size is capped.
 */
export function readTar(bytes: Uint8Array, maxTotal = BOMB_UNCOMPRESSED): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const used = new Map<string, string>();
  let i = 0;
  let total = 0;
  while (i + 512 <= bytes.length) {
    const header = bytes.subarray(i, i + 512);
    if (header.every((b) => b === 0)) break;
    let name = strFromU8(header.subarray(0, 100)).replace(/\0.*$/, '');
    const sizeOct = strFromU8(header.subarray(124, 136)).replace(/\0.*$/, '').trim();
    const size = Math.max(0, parseInt(sizeOct, 8) || 0);
    const typeFlag = String.fromCharCode(header[156] ?? 0x30);
    const magic = strFromU8(header.subarray(257, 262));
    if (magic === 'ustar') {
      const prefix = strFromU8(header.subarray(345, 500)).replace(/\0.*$/, '');
      if (prefix) name = `${prefix}/${name}`;
    }
    i += 512;
    const dataEnd = i + size;
    const regular = typeFlag === '0' || typeFlag === '\0' || typeFlag === '7';
    if (regular && dataEnd <= bytes.length) {
      const rel = safeRelPath(name);
      const key = rel ? collisionKey(rel) : '';
      if (rel && (!used.has(key) || used.get(key) === rel)) {
        total += size;
        if (total > maxTotal) throw new ArchiveBombError('TAR: Gesamtgröße über Schwelle — Abbruch.');
        used.set(key, rel);
        files[rel] = bytes.subarray(i, dataEnd);
      }
    }
    i += size + ((512 - (size % 512)) % 512);
  }
  return files;
}

export function createTarGz(files: Record<string, Uint8Array>, level = 6): Uint8Array {
  return gzipSync(createTar(files), { level: flateLevel(level) });
}

export function readTarGz(bytes: Uint8Array): Record<string, Uint8Array> {
  return readTar(gunzipLimited(bytes));
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
  if (kind === 'tar' || kind === 'tgz') {
    try {
      return { files: kind === 'tar' ? readTar(bytes) : readTarGz(bytes), warnings: [], blocked: [] };
    } catch (err) {
      if (err instanceof ArchiveBombError) return { files: {}, warnings: [err.message], blocked: [] };
      throw err;
    }
  }
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
  const warnings: string[] = [];
  const used = new Map<string, string>();
  let announced = 0;
  for (const entry of entries) {
    if (entry.directory) continue;
    const rel = safeRelPath(entry.filename);
    if (!rel) {
      blocked.push(entry.filename);
      continue;
    }
    const key = collisionKey(rel);
    if (used.has(key) && used.get(key) !== rel) {
      blocked.push(entry.filename);
      warnings.push(`Pfad-Kollision (Unicode/Case): ${rel}`);
      continue;
    }
    announced += entry.uncompressedSize;
    const ratio = entry.uncompressedSize / Math.max(entry.compressedSize, 1);
    if (announced > BOMB_UNCOMPRESSED || (entry.uncompressedSize > 1024 * 1024 && ratio > BOMB_RATIO)) {
      await reader.close();
      return { files: {}, warnings: ['Zip-Bomb (Passwort-ZIP): angekündigte Größe/Ratio über Schwelle — Abbruch.'], blocked };
    }
    const data = await entry.getData?.(new zip.Uint8ArrayWriter());
    if (data) {
      used.set(key, rel);
      files[rel] = data;
    }
  }
  await reader.close();
  return { files, warnings, blocked };
}
