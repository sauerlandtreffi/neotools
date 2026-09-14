import { eqAt, latin1 } from '@neotools/parsers';
import type { ImageFormat } from './types.js';

export function detectFormat(bytes: Uint8Array, name = '', mime = ''): ImageFormat | undefined {
  if (eqAt(bytes, 0, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (eqAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47])) {
    const text = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 256)));
    if (text.includes('acTL')) return 'apng';
    return 'png';
  }
  if (latin1(bytes, 0, 4) === 'RIFF' && latin1(bytes, 8, 4) === 'WEBP') return 'webp';
  if (eqAt(bytes, 4, [0x66, 0x74, 0x79, 0x70])) {
    const brand = latin1(bytes, 8, 4);
    if (/heic|heix|heif|mif1|msf1|avif/i.test(brand) || /heic|heif|mif1/i.test(latin1(bytes, 8, 16))) {
      if (/avif/i.test(latin1(bytes, 8, 16))) return 'avif';
      return 'heic';
    }
  }
  if (eqAt(bytes, 0, [0x00, 0x00, 0x00]) && bytes[3] === 0x0c && latin1(bytes, 4, 4) === 'jxl ') return 'jxl';
  if (eqAt(bytes, 0, [0xff, 0x0a])) return 'jxl';
  if (eqAt(bytes, 0, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (eqAt(bytes, 0, [0x42, 0x4d])) return 'bmp';
  if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 0x2a)) {
    return 'tiff';
  }
  if (bytes[0] === 0 && bytes[1] === 0 && (bytes[2] === 1 || bytes[2] === 2) && bytes.length > 6) return 'ico';
  if (bytes[0] === 0x50 && bytes[1] === 0x31) return 'pbm';
  if (bytes[0] === 0x50 && bytes[1] === 0x32) return 'pgm';
  if (bytes[0] === 0x50 && bytes[1] === 0x33) return 'ppm';
  if (bytes[0] === 0x50 && bytes[1] === 0x34) return 'pbm';
  if (bytes[0] === 0x50 && bytes[1] === 0x35) return 'pgm';
  if (bytes[0] === 0x50 && bytes[1] === 0x36) return 'ppm';
  if (latin1(bytes, 0, 5).includes('<?xml') || latin1(bytes, 0, 4) === '<svg' || /<svg[\s>]/i.test(latin1(bytes, 0, 256))) {
    return 'svg';
  }
  const lower = name.toLowerCase();
  const fromName: Record<string, ImageFormat> = {
    '.jpg': 'jpeg',
    '.jpeg': 'jpeg',
    '.png': 'png',
    '.webp': 'webp',
    '.avif': 'avif',
    '.jxl': 'jxl',
    '.gif': 'gif',
    '.bmp': 'bmp',
    '.tga': 'tga',
    '.ppm': 'ppm',
    '.pgm': 'pgm',
    '.pbm': 'pbm',
    '.ico': 'ico',
    '.tif': 'tiff',
    '.tiff': 'tiff',
    '.heic': 'heic',
    '.heif': 'heic',
    '.svg': 'svg',
    '.apng': 'apng',
  };
  const dot = lower.lastIndexOf('.');
  if (dot >= 0 && fromName[lower.slice(dot)]) return fromName[lower.slice(dot)];
  if (mime.startsWith('image/')) {
    if (mime.includes('jpeg')) return 'jpeg';
    if (mime.includes('png') && mime.includes('apng')) return 'apng';
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('avif')) return 'avif';
    if (mime.includes('gif')) return 'gif';
    if (mime.includes('bmp')) return 'bmp';
    if (mime.includes('tiff')) return 'tiff';
    if (mime.includes('svg')) return 'svg';
    if (mime.includes('heic') || mime.includes('heif')) return 'heic';
    if (mime.includes('jxl')) return 'jxl';
    if (mime.includes('icon')) return 'ico';
  }
  if (bytes.length > 18 && (bytes[2] === 2 || bytes[2] === 3) && (bytes[16] === 24 || bytes[16] === 32 || bytes[16] === 8)) {
    if (lower.endsWith('.tga') || mime.includes('targa') || mime.includes('tga')) return 'tga';
  }
  return undefined;
}

export function parseFormatName(value: string): ImageFormat | undefined {
  const v = value.toLowerCase().replace(/^\./, '');
  if (v === 'jpg' || v === 'jpeg') return 'jpeg';
  if (v === 'tif') return 'tiff';
  if (v === 'heif') return 'heic';
  if (v === 'cur') return 'ico';
  const allowed: ImageFormat[] = [
    'jpeg', 'png', 'webp', 'avif', 'jxl', 'gif', 'bmp', 'tga', 'ppm', 'pgm', 'pbm', 'ico', 'tiff', 'heic', 'svg', 'apng',
  ];
  return allowed.find((f) => f === v);
}
