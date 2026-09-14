import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

export type ZipMap = Record<string, Uint8Array>;

export function unzipBytes(data: Uint8Array): ZipMap {
  const raw = unzipSync(data);
  const out: ZipMap = {};
  for (const [name, bytes] of Object.entries(raw)) {
    if (bytes) out[name.replace(/\\/g, '/')] = bytes;
  }
  return out;
}

export function zipBytes(files: ZipMap, uncompressed: readonly string[] = []): Uint8Array {
  const zipped: Zippable = {};
  for (const [name, bytes] of Object.entries(files)) {
    zipped[name] = [bytes, { level: uncompressed.includes(name) ? 0 : 6 }];
  }
  return zipSync(zipped);
}

export function zipText(path: string, zip: ZipMap): string {
  const bytes = zip[path] ?? zip[path.replace(/^\//, '')];
  if (!bytes) return '';
  return strFromU8(bytes);
}

export function putText(zip: ZipMap, path: string, text: string): void {
  zip[path] = strToU8(text);
}

export function findZip(zip: ZipMap, pred: (name: string) => boolean): Array<{ name: string; bytes: Uint8Array }> {
  return Object.entries(zip)
    .filter(([name]) => pred(name))
    .map(([name, bytes]) => ({ name, bytes }));
}
