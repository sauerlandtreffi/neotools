/**
 * Color management (light).
 *
 * - ICC profiles are detected on JPEG (APP2 ICC_PROFILE) and PNG (iCCP) and stored on `meta.icc`.
 * - Encode options: `iccMode: 'keep' | 'srgb' | 'strip'`.
 *   - keep: passthrough the source profile bytes (no pixel conversion).
 *   - srgb: tag as sRGB when the encoder supports it; pixels are left unchanged unless
 *     the runtime can convert (`OffscreenCanvas`/`canvas` 2d `colorSpace: 'srgb'` or a
 *     jSquash encode path that exposes color-space). This package does **not** ship a
 *     LittleCMS WASM converter (that's `image-icc` later).
 *   - strip: drop ICC/EXIF/XMP color tags.
 * - True profile transforms are documented as out of scope for Phase 2 core.
 */

export const COLOR_POLICY = {
  convertsPixels: false,
  tagsSrgb: true,
  passthroughIcc: true,
  engine: 'tag-only unless canvas/jsquash colorSpace is available',
} as const;
