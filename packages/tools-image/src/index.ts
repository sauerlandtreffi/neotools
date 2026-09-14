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
import { imagePassport } from './tools/image-passport.js';
import { imageLivePhoto } from './tools/image-live-photo.js';
import { imageRedEye } from './tools/image-red-eye.js';
import { imageLineArt } from './tools/image-line-art.js';
import { imagePixelArt } from './tools/image-pixel-art.js';
import { imageToSvgTool } from './tools/image-to-svg.js';
import { imageLut } from './tools/image-lut.js';
import { imageScopes } from './tools/image-scopes.js';
import { imageSeamlessTexture } from './tools/image-seamless-texture.js';
import { imageNormalMap } from './tools/image-normal-map.js';
import { imageHdrTonemap } from './tools/image-hdr-tonemap.js';
import { imageIcc } from './tools/image-icc.js';
import { imageGeotagExport } from './tools/image-geotag-export.js';
import { imageSortByDate } from './tools/image-sort-by-date.js';
import { imageBurstBest } from './tools/image-burst-best.js';
import { imageColorTransfer } from './tools/image-color-transfer.js';
import { imageHiddenLayerCheck } from './tools/image-hidden-layer-check.js';
import { imageFilmScan } from './tools/image-film-scan.js';

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
  imagePassport,
  imageLivePhoto,
  imageRedEye,
  imageLineArt,
  imagePixelArt,
  imageToSvgTool,
  imageLut,
  imageScopes,
  imageSeamlessTexture,
  imageNormalMap,
  imageHdrTonemap,
  imageIcc,
  imageGeotagExport,
  imageSortByDate,
  imageBurstBest,
  imageColorTransfer,
  imageHiddenLayerCheck,
  imageFilmScan,
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
  imagePassport,
  imageLivePhoto,
  imageRedEye,
  imageLineArt,
  imagePixelArt,
  imageToSvgTool,
  imageLut,
  imageScopes,
  imageSeamlessTexture,
  imageNormalMap,
  imageHdrTonemap,
  imageIcc,
  imageGeotagExport,
  imageSortByDate,
  imageBurstBest,
  imageColorTransfer,
  imageHiddenLayerCheck,
  imageFilmScan,
};

export { IMAGE_LICENSES } from './licenses.js';
export { decode, encode, encodeRgba, resample, detectFormat, encodePngRgba, decodePng } from './codec/index.js';
export { encodeGif, decodeGif } from './codec/gif.js';
export { emptyMeta } from './codec/types.js';
export type { DecodedImage, ImageFormat } from './codec/index.js';
export { boxBlur, pixelate } from './ops/blur.js';
export { stripJpegSegments, embedJpegMeta, embedPngMeta, embedWebpMeta, jpegApp1Exif } from './codec/meta-embed.js';
export { buildExifTiff, buildXmp } from './meta/exif-write.js';
export { cropRect, cropCircle, boxFromAspect } from './ops/crop.js';
export { fillBackground, hexToRgb, luma, clampByte, copyRgba } from './codec/pixels.js';
export { applyTextWatermark, applyImageWatermark } from './ops/watermark.js';
export { readImageMetadata } from './meta/read.js';
export { applyLutCube, parseCubeLut } from './ops/lut.js';
export { renderScopes } from './ops/scopes.js';
export { imageToSvg, hatchSvg } from './ops/trace.js';
export { reinhardTransfer } from './ops/color-transfer.js';

