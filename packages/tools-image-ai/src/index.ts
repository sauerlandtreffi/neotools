import { Registry } from '@neotools/engine';
import type { ToolDefinition } from '@neotools/engine';
import { imageRemoveBackground } from './tools/image-remove-background.js';
import { imageAutoBlur } from './tools/image-auto-blur.js';
import { imageDocRepair } from './tools/image-doc-repair.js';
import { imageScreenshotWorkshop } from './tools/image-screenshot-workshop.js';
import { imageUpscale } from './tools/image-upscale.js';
import { imageDenoise } from './tools/image-denoise.js';
import { imageAltText } from './tools/image-alt-text.js';
import { a11yEasyRead } from './tools/a11y-easy-read.js';
import { a11ySignFriendly } from './tools/a11y-sign-friendly.js';

export const imageAiTools: ToolDefinition[] = [
  imageRemoveBackground,
  imageAutoBlur,
  imageDocRepair,
  imageScreenshotWorkshop,
  imageUpscale,
  imageDenoise,
  imageAltText,
  a11yEasyRead,
  a11ySignFriendly,
];

export function registerImageAiTools(registry: Registry): Registry {
  for (const tool of imageAiTools) registry.register(tool);
  return registry;
}

export function createImageAiRegistry(): Registry {
  return registerImageAiTools(new Registry());
}

export {
  imageRemoveBackground,
  imageAutoBlur,
  imageDocRepair,
  imageScreenshotWorkshop,
  imageUpscale,
  imageDenoise,
  imageAltText,
  a11yEasyRead,
  a11ySignFriendly,
};

export { IMAGE_AI_LICENSES } from './licenses.js';
export { decode, encode, encodePng, decodePng, type RasterImage } from './raster.js';
export { MODEL_REGISTRY, listModels, getModel, modelsForTool, modelConfirmMessage } from './models/catalog.js';
export { modelStatus, isModelReady, loadOnnxBytes } from './models/load.js';
export { findSecrets } from './secrets/patterns.js';
export { setOcrOverride } from './ocr/page.js';
export { findDocumentQuad } from './cv/quad.js';
export { findHomography, applyHomography, warpPerspective } from './cv/homography.js';
export { sauvola } from './cv/sauvola.js';
export { estimateSkewDegrees, rotateRaster } from './cv/deskew.js';
export { stitchVertical, findVerticalOverlap } from './cv/stitch.js';
export { boxVariance, applyStyle } from './cv/filters.js';
export { heuristicFaceBoxes, boxesFromYunet } from './cv/faces.js';
