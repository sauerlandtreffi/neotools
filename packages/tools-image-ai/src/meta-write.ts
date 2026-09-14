import {
  buildExifTiff,
  buildXmp,
  detectFormat,
  embedJpegMeta,
  embedPngMeta,
  embedWebpMeta,
  jpegApp1Exif,
} from '@neotools/tools-image';
import type { RasterImage } from './raster.js';

export function writeImageDescription(
  bytes: Uint8Array,
  name: string,
  img: RasterImage,
  description: string,
): { bytes: Uint8Array; mime: string } | null {
  const tiff = buildExifTiff({ description, software: 'NeoTools image-alt-text' });
  const xmp = buildXmp({ description });
  const format = detectFormat(bytes, name);
  if (format === 'jpeg') {
    return { bytes: embedJpegMeta(bytes, { exif: jpegApp1Exif(tiff), xmp }), mime: 'image/jpeg' };
  }
  if (format === 'png') {
    return { bytes: embedPngMeta(img.data, img.width, img.height, { exif: tiff, xmp }), mime: 'image/png' };
  }
  if (format === 'webp') {
    return { bytes: embedWebpMeta(bytes, { exif: tiff, xmp }), mime: 'image/webp' };
  }
  return null;
}
