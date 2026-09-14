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
import { decode, encode, type RasterImage, type RasterMime } from '../raster.js';

export async function decodeFile(file: NeoFile): Promise<RasterImage> {
  const bytes = await file.bytes();
  return decode(bytes, file.mime);
}

export async function encodeOut(
  img: RasterImage,
  mime: RasterMime,
  name: string,
  quality?: number,
): Promise<NeoFile> {
  const bytes = await encode(img, mime, { quality });
  return neoFileFromBytes(name, bytes, mime);
}

export function stem(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'image';
}

export function outMime(fmt: 'png' | 'jpeg' | 'jpg' | 'webp'): RasterMime {
  if (fmt === 'webp') return MIME.webp;
  if (fmt === 'jpeg' || fmt === 'jpg') return MIME.jpeg;
  return MIME.png;
}

export function extFor(mime: RasterMime): string {
  if (mime === MIME.jpeg) return 'jpg';
  if (mime === MIME.webp) return 'webp';
  return 'png';
}

export async function batchImages(
  ctx: ToolContext,
  files: NeoFile[],
  options: unknown,
  each: (file: NeoFile, img: RasterImage, index: number) => Promise<{ files: NeoFile[]; extra?: Record<string, unknown> }>,
): Promise<ToolResult> {
  const warnings: string[] = [];
  const extras: unknown[] = [];
  const mapped = await mapFiles(files, async (file, i) => {
    ctx.progress(i / Math.max(files.length, 1), file.name);
    const img = await decodeFile(file);
    return each(file, img, i);
  });
  const outputs: NeoFile[] = [];
  for (const row of mapped.ok) {
    outputs.push(...row.value.files);
    if (row.value.extra) extras.push({ file: row.file.name, ...row.value.extra });
  }
  for (const err of mapped.errors) warnings.push(`${err.file}: ${err.reason}`);
  const provenance = await createProvenance('image-ai', options, files);
  return {
    outputs,
    warnings,
    report: attachProvenance({ batch: mapped.protocol, files: extras }, provenance),
  };
}
