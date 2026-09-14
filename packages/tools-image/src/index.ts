import { Registry } from '@neotools/engine';
import type { ToolDefinition } from '@neotools/engine';
import { imageConvert } from './tools/image-convert.js';
import { imageCompress } from './tools/image-compress.js';
import { imageResize } from './tools/image-resize.js';
import { imageCrop } from './tools/image-crop.js';
import { imageRotateFlip } from './tools/image-rotate-flip.js';
import { imageAdjust } from './tools/image-adjust.js';
import { imageWatermark } from './tools/image-watermark.js';
import { imageMetadata } from './tools/image-metadata.js';
import { imageRedact } from './tools/image-redact.js';
import { imageCompare } from './tools/image-compare.js';
import { creatorExportPack } from './tools/creator-export-pack.js';
import { imageToAnimation } from './tools/image-to-animation.js';
import { imagePalette } from './tools/image-palette.js';
import { imageColorblind } from './tools/image-colorblind.js';
import { imageExifBatch } from './tools/image-exif-batch.js';
import { imageDuplicates } from './tools/image-duplicates.js';
import { imageAscii } from './tools/image-ascii.js';

export const imageTools: ToolDefinition[] = [
  imageConvert,
  imageCompress,
  imageResize,
  imageCrop,
  imageRotateFlip,
  imageAdjust,
  imageWatermark,
  imageMetadata,
  imageRedact,
  imageCompare,
  creatorExportPack,
  imageToAnimation,
  imagePalette,
  imageColorblind,
  imageExifBatch,
  imageDuplicates,
  imageAscii,
];

export function registerImageTools(registry: Registry): Registry {
  for (const tool of imageTools) registry.register(tool);
  return registry;
}

export function createImageRegistry(): Registry {
  return registerImageTools(new Registry());
}

export {
  imageConvert,
  imageCompress,
  imageResize,
  imageCrop,
  imageRotateFlip,
  imageAdjust,
  imageWatermark,
  imageMetadata,
  imageRedact,
  imageCompare,
  creatorExportPack,
  imageToAnimation,
  imagePalette,
  imageColorblind,
  imageExifBatch,
  imageDuplicates,
  imageAscii,
};

export { IMAGE_LICENSES } from './licenses.js';
export { decode, encode, encodeRgba, resample, detectFormat, encodePngRgba, decodePng } from './codec/index.js';
export type { DecodedImage, ImageFormat } from './codec/index.js';
export { boxBlur, pixelate } from './ops/blur.js';
export { stripJpegSegments, embedJpegMeta, embedPngMeta, embedWebpMeta, jpegApp1Exif } from './codec/meta-embed.js';
export { buildExifTiff, buildXmp } from './meta/exif-write.js';
export { emptyMeta } from './codec/types.js';
