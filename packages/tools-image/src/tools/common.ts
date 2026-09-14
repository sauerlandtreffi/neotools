import {
  MIME,
  attachProvenance,
  createProvenance,
  mapFiles,
  neoFileFromBytes,
  type NeoFile,
  type ToolContext,
  type ToolResult,
} from '@neotools/engine';
import { decode, encode, parseFormatName, type DecodedImage, type EncodeOptions, type ImageFormat } from '../codec/index.js';
import { IMAGE_LICENSES } from '../licenses.js';

export const IMAGE_ACCEPT = [
  MIME.jpeg,
  MIME.png,
  'image/jpg',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/heic',
  'image/heif',
  'image/svg+xml',
  'image/jxl',
  'image/x-tga',
  'image/x-portable-pixmap',
  'image/x-portable-graymap',
  'image/x-portable-bitmap',
  'image/apng',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.avif',
  '.gif',
  '.bmp',
  '.tif',
  '.tiff',
  '.ico',
  '.heic',
  '.heif',
  '.svg',
  '.jxl',
  '.tga',
  '.ppm',
  '.pgm',
  '.pbm',
  '.apng',
];

export { IMAGE_LICENSES };

export function stem(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return base || 'image';
  return base.slice(0, dot) || 'image';
}

export function outName(name: string, ext: string): string {
  return `${stem(name)}.${ext}`;
}

export async function decodeFile(file: NeoFile, applyOrientation = true, targetWidth?: number): Promise<DecodedImage> {
  const bytes = await file.bytes();
  return decode({ bytes, name: file.name, mime: file.mime, targetWidth }, { applyOrientation });
}

export async function encodeImage(
  img: DecodedImage,
  format: ImageFormat,
  options: EncodeOptions,
  filename: string,
): Promise<NeoFile> {
  const bytes = await encode(img, format, options);
  const { FORMAT_MIME } = await import('../codec/types.js');
  return neoFileFromBytes(filename, bytes, FORMAT_MIME[format]);
}

export function parseBoxesJson(raw: string): Array<{ x: number; y: number; w: number; h: number; unit?: 'px' | 'percent' }> {
  if (!raw || !raw.trim()) return [];
  const v = JSON.parse(raw) as unknown;
  if (!Array.isArray(v)) throw new Error('boxesJson muss ein JSON-Array sein.');
  return v.map((b) => {
    const o = b as Record<string, unknown>;
    return {
      x: Number(o.x),
      y: Number(o.y),
      w: Number(o.w),
      h: Number(o.h),
      unit: o.unit === 'percent' ? 'percent' : 'px',
    };
  });
}

export async function mapImages(
  ctx: ToolContext,
  files: NeoFile[],
  fn: (file: NeoFile, img: DecodedImage, index: number) => Promise<NeoFile[]>,
  applyOrientation = true,
): Promise<ToolResult> {
  const outputs: NeoFile[] = [];
  const loaded = await mapFiles(files, async (file, i) => {
    ctx.progress(i / Math.max(files.length, 1), file.name);
    const img = await decodeFile(file, applyOrientation);
    const out = await fn(file, img, i);
    outputs.push(...out);
    return out;
  });
  const provenance = await createProvenance('image', {}, files);
  return {
    outputs,
    warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
    report: attachProvenance({ batch: loaded.protocol }, provenance),
  };
}

export function formatFromOption(value: string, fallback: ImageFormat = 'png'): ImageFormat {
  return parseFormatName(value) ?? fallback;
}
