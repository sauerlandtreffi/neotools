export const IMAGE_FORMATS = [
  'jpeg',
  'png',
  'webp',
  'avif',
  'jxl',
  'gif',
  'bmp',
  'tga',
  'ppm',
  'pgm',
  'pbm',
  'ico',
  'tiff',
  'heic',
  'svg',
  'apng',
] as const;

export type ImageFormat = (typeof IMAGE_FORMATS)[number];

export interface DecodedFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  delayMs: number;
}

export interface ImageMeta {
  format: ImageFormat;
  mime: string;
  orientation: number;
  icc?: Uint8Array;
  exif?: Uint8Array;
  xmp?: string;
  iptc?: Uint8Array;
  pages: number;
  frames?: DecodedFrame[];
  colorSpace: 'srgb' | 'unknown';
  /** True ICC bytes were seen; conversion to sRGB is only applied when the encoder/canvas supports colorSpace. */
  iccTagged: boolean;
  comments: string[];
}

export interface DecodedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  meta: ImageMeta;
  extraPages?: DecodedImage[];
}

export interface DecodeOptions {
  applyOrientation?: boolean;
}

export interface EncodeOptions {
  quality?: number;
  lossless?: boolean;
  keepMetadata?: boolean;
  background?: readonly [number, number, number] | readonly [number, number, number, number];
  iccMode?: 'keep' | 'srgb' | 'strip';
  icc?: Uint8Array;
  exif?: Uint8Array;
  xmp?: string;
  optimize?: boolean;
  frames?: DecodedFrame[];
  icoSizes?: readonly number[];
}

export const FORMAT_MIME: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  jxl: 'image/jxl',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tga: 'image/x-tga',
  ppm: 'image/x-portable-pixmap',
  pgm: 'image/x-portable-graymap',
  pbm: 'image/x-portable-bitmap',
  ico: 'image/x-icon',
  tiff: 'image/tiff',
  heic: 'image/heic',
  svg: 'image/svg+xml',
  apng: 'image/apng',
};

export const FORMAT_EXT: Record<ImageFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
  jxl: 'jxl',
  gif: 'gif',
  bmp: 'bmp',
  tga: 'tga',
  ppm: 'ppm',
  pgm: 'pgm',
  pbm: 'pbm',
  ico: 'ico',
  tiff: 'tiff',
  heic: 'heic',
  svg: 'svg',
  apng: 'png',
};

export const NO_ALPHA = new Set<ImageFormat>(['jpeg', 'bmp', 'ppm', 'pgm', 'pbm']);

export function emptyMeta(format: ImageFormat): ImageMeta {
  return {
    format,
    mime: FORMAT_MIME[format],
    orientation: 1,
    pages: 1,
    colorSpace: 'unknown',
    iccTagged: false,
    comments: [],
  };
}

export function clonePixels(img: DecodedImage): DecodedImage {
  return {
    width: img.width,
    height: img.height,
    data: new Uint8ClampedArray(img.data),
    meta: { ...img.meta, icc: img.meta.icc ? img.meta.icc.slice() : undefined, exif: img.meta.exif ? img.meta.exif.slice() : undefined },
    extraPages: img.extraPages?.map(clonePixels),
  };
}
