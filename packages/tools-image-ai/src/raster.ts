/**
 * Raster I/O for the image-ai pack — thin wrapper over `@neotools/tools-image`.
 *
 * Kept signatures:
 *   decode(file) → RasterImage
 *   encode(img, 'image/png' | 'image/jpeg' | 'image/webp', { quality })
 */
import {
  boxBlur,
  decode as decodeImage,
  decodePng as decodePngCodec,
  encode as encodeImage,
  encodePngRgba,
  emptyMeta,
  pixelate,
  resample,
  stripJpegSegments,
  type DecodedImage,
} from '@neotools/tools-image';

export { boxBlur, pixelate, resample, stripJpegSegments };

export interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type RasterMime = 'image/png' | 'image/jpeg' | 'image/webp';

export interface EncodeOptions {
  quality?: number;
}

function qualityPercent(quality?: number): number {
  const q = quality ?? 0.92;
  return Math.max(1, Math.min(100, Math.round(q <= 1 ? q * 100 : q)));
}

function asDecoded(img: RasterImage, format: 'png' | 'jpeg' | 'webp'): DecodedImage {
  return { width: img.width, height: img.height, data: img.data, meta: emptyMeta(format) };
}

export function sniffMime(bytes: Uint8Array, hint?: string): RasterMime {
  if (bytes[0] === 137 && bytes[1] === 80) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (hint === 'image/jpeg' || hint === 'image/jpg') return 'image/jpeg';
  if (hint === 'image/webp') return 'image/webp';
  if (hint === 'image/png') return 'image/png';
  throw new Error('Unbekanntes Bildformat (PNG/JPEG/WebP erwartet).');
}

export function encodePng(img: RasterImage): Uint8Array {
  return encodePngRgba(img.data, img.width, img.height);
}

export function decodePng(bytes: Uint8Array): RasterImage {
  const img = decodePngCodec(bytes);
  if (!img) throw new Error('Kein PNG.');
  return { width: img.width, height: img.height, data: img.data };
}

export async function decode(file: Uint8Array, mimeHint?: string): Promise<RasterImage> {
  const img = await decodeImage({ bytes: file, mime: mimeHint });
  return { width: img.width, height: img.height, data: img.data };
}

export async function encode(img: RasterImage, mime: RasterMime, opts: EncodeOptions = {}): Promise<Uint8Array> {
  const format = mime === 'image/jpeg' ? 'jpeg' : mime === 'image/webp' ? 'webp' : 'png';
  return encodeImage(asDecoded(img, format), format, { quality: qualityPercent(opts.quality), keepMetadata: false });
}

export function cloneRaster(img: RasterImage): RasterImage {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

export function resizeBilinear(img: RasterImage, width: number, height: number): RasterImage {
  const out = resample(img.data, img.width, img.height, width, height, 'bilinear');
  return { width: out.width, height: out.height, data: out.data };
}

export function letterbox(
  img: RasterImage,
  size: number,
  fill = 0,
): { image: RasterImage; scale: number; padX: number; padY: number } {
  const scale = Math.min(size / img.width, size / img.height);
  const nw = Math.max(1, Math.round(img.width * scale));
  const nh = Math.max(1, Math.round(img.height * scale));
  const resized = resizeBilinear(img, nw, nh);
  const out = new Uint8ClampedArray(size * size * 4);
  if (fill) out.fill(fill);
  const padX = Math.floor((size - nw) / 2);
  const padY = Math.floor((size - nh) / 2);
  for (let y = 0; y < nh; y++) {
    const src = y * nw * 4;
    const dest = ((y + padY) * size + padX) * 4;
    out.set(resized.data.subarray(src, src + nw * 4), dest);
  }
  return { image: { width: size, height: size, data: out }, scale, padX, padY };
}
