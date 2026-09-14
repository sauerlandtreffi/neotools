import type { DecodedImage, EncodeOptions, ImageFormat } from './types.js';
import { FORMAT_MIME, NO_ALPHA } from './types.js';
import { fillBackground } from './pixels.js';
import { encodeBmp, encodeTga, encodePpm } from './simple.js';
import { encodeIco } from './ico.js';
import { encodeGif } from './gif.js';
import { encodeApng } from './apng.js';
import { encodeTiff } from './tiff.js';
import { encodeHeic } from './heic.js';
import { encodeSvg } from './svg.js';
import {
  encodeJpegJsquash,
  encodePngJsquash,
  encodeWebpJsquash,
  encodeAvifJsquash,
  encodeJxlJsquash,
  optimizePngOxipng,
} from './jsquash.js';
import { embedJpegMeta, embedPngMeta, embedWebpMeta } from './meta-embed.js';

function pixelsFor(format: ImageFormat, img: DecodedImage, options: EncodeOptions): Uint8ClampedArray {
  if (!NO_ALPHA.has(format)) return img.data;
  return fillBackground(img.data, options.background ?? [255, 255, 255]);
}

export async function encode(
  img: DecodedImage,
  format: ImageFormat,
  options: EncodeOptions = {},
): Promise<Uint8Array> {
  const quality = options.quality ?? 85;
  const data = pixelsFor(format, img, options);
  const keep = options.keepMetadata !== false;
  const icc =
    options.iccMode === 'strip' ? undefined : options.icc ?? (options.iccMode === 'keep' || keep ? img.meta.icc : undefined);
  const exif = keep ? (options.exif ?? img.meta.exif) : options.exif;
  const xmp = keep ? (options.xmp ?? img.meta.xmp) : options.xmp;

  switch (format) {
    case 'jpeg': {
      let jpeg = await encodeJpegJsquash({ data, width: img.width, height: img.height }, quality);
      if (exif || xmp || icc) jpeg = embedJpegMeta(jpeg, { exif, xmp, icc, strip: !keep });
      return jpeg;
    }
    case 'png': {
      if (options.optimize) {
        try {
          const raw = await encodePngJsquash({ data, width: img.width, height: img.height });
          return await optimizePngOxipng(raw);
        } catch {
          // fall through to own encoder
        }
      }
      return embedPngMeta(data, img.width, img.height, { exif, xmp, icc });
    }
    case 'webp': {
      const frames = options.frames ?? img.meta.frames;
      if (frames && frames.length > 1) {
        // Animated WebP via first-frame encode (single still) — full anim mux is Phase-3/ffmpeg.
        // We still encode a still of frame 0; slideshow tool uses GIF/APNG primarily,
        // and tries webp stills per frame packed elsewhere.
      }
      let webp = await encodeWebpJsquash({ data, width: img.width, height: img.height }, quality, Boolean(options.lossless));
      if (exif || xmp || icc) webp = embedWebpMeta(webp, { exif, xmp, icc, strip: !keep });
      return webp;
    }
    case 'avif':
      return encodeAvifJsquash({ data, width: img.width, height: img.height }, quality, Boolean(options.lossless));
    case 'jxl':
      return encodeJxlJsquash({ data, width: img.width, height: img.height }, quality, Boolean(options.lossless));
    case 'gif': {
      const frames = options.frames ?? img.meta.frames ?? [{ data, width: img.width, height: img.height, delayMs: 100 }];
      return await encodeGif(frames);
    }
    case 'apng': {
      const frames = options.frames ?? img.meta.frames ?? [{ data, width: img.width, height: img.height, delayMs: 100 }];
      return encodeApng(frames);
    }
    case 'bmp':
      return encodeBmp(data, img.width, img.height);
    case 'tga':
      return encodeTga(data, img.width, img.height);
    case 'ppm':
      return encodePpm(data, img.width, img.height, 'ppm');
    case 'pgm':
      return encodePpm(data, img.width, img.height, 'pgm');
    case 'pbm':
      return encodePpm(data, img.width, img.height, 'pbm');
    case 'ico':
      return encodeIco(data, img.width, img.height, options.icoSizes ?? [16, 32, 48]);
    case 'tiff':
      return encodeTiff(data, img.width, img.height);
    case 'heic':
      return encodeHeic(data, img.width, img.height);
    case 'svg':
      return encodeSvg();
    default:
      throw new Error(`Encode nicht implementiert: ${format}`);
  }
}

export function mimeOf(format: ImageFormat): string {
  return FORMAT_MIME[format];
}

/** Encode RGBA buffer without a full DecodedImage (tests / internals). */
export async function encodeRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  format: ImageFormat,
  options: EncodeOptions = {},
): Promise<Uint8Array> {
  return encode(
    {
      width,
      height,
      data,
      meta: {
        format: 'png',
        mime: 'image/png',
        orientation: 1,
        pages: 1,
        colorSpace: 'srgb',
        iccTagged: false,
        comments: [],
      },
    },
    format,
    options,
  );
}
