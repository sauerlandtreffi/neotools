import { parseJpeg } from '@neotools/parsers';

const RAW = /\.(cr2|cr3|nef|arw|dng|raf|orf|rw2|pef)$/i;
const STILL = /\.(jpe?g|heic|heif|png|tif{1,2})$/i;
const XMP = /\.xmp$/i;

export function sidecarGroups(names: string[]): string[][] {
  const map = new Map<string, string[]>();
  for (const name of names) {
    const base = name.replace(/\.[^.]+$/, '').toLowerCase();
    const arr = map.get(base) ?? [];
    arr.push(name);
    map.set(base, arr);
  }
  return [...map.values()].filter((g) => g.length > 1 && g.some((n) => STILL.test(n) || RAW.test(n) || XMP.test(n)));
}

export function datedName(name: string, bytes: Uint8Array): string {
  let date = '';
  if (/\.jpe?g$/i.test(name)) {
    const jpeg = parseJpeg(bytes);
    date = (jpeg?.exif?.datetime ?? '').replace(/[: ]/g, '').slice(0, 8);
    if (date.length === 8) date = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}_`;
    else date = '';
  }
  const base = name.split('/').pop() ?? name;
  return `${date}${base}`;
}

export function isSidecarPair(a: string, b: string): boolean {
  return a.replace(/\.[^.]+$/, '').toLowerCase() === b.replace(/\.[^.]+$/, '').toLowerCase();
}
