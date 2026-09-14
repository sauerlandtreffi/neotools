import { parseTiff } from '@neotools/parsers';
import type { DecodedImage, DecodeOptions, ImageFormat } from './types.js';
import { emptyMeta } from './types.js';
import { detectFormat } from './detect.js';
import { decodePng as decodePngOwn } from './png.js';
import { decodeBmp, decodeTga, decodePpm } from './simple.js';
import { decodeGif } from './gif.js';
import { decodeApng } from './apng.js';
import { decodeIco } from './ico.js';
import { decodeTiff } from './tiff.js';
import { decodeHeic } from './heic.js';
import { decodeSvg } from './svg.js';
import {
  decodeJpegJsquash,
  decodePngJsquash,
  decodeWebpJsquash,
  decodeAvifJsquash,
  decodeJxlJsquash,
} from './jsquash.js';
import { extractJpegMeta, extractWebpMeta, readPngSidecar } from './meta-embed.js';
import { applyOrientation } from './orientation.js';

export interface DecodeInput {
  bytes: Uint8Array;
  name?: string;
  mime?: string;
  targetWidth?: number;
}

async function attachSidecar(img: DecodedImage, bytes: Uint8Array, format: ImageFormat): Promise<DecodedImage> {
  if (format === 'jpeg') {
    const m = extractJpegMeta(bytes);
    img.meta = { ...img.meta, ...m, format: 'jpeg', mime: 'image/jpeg', pages: 1, comments: img.meta.comments };
  } else if (format === 'png' || format === 'apng') {
    const m = readPngSidecar(bytes);
    const tiff = m.exif ? parseTiff(m.exif) : undefined;
    img.meta = {
      ...img.meta,
      exif: m.exif,
      icc: m.icc,
      iccTagged: Boolean(m.icc),
      orientation: typeof tiff?.ifds[0]?.tags.find((t) => t.tag === 0x0112)?.value === 'number'
        ? (tiff!.ifds[0]!.tags.find((t) => t.tag === 0x0112)!.value as number)
        : 1,
    };
  } else if (format === 'webp') {
    const m = extractWebpMeta(bytes);
    img.meta = { ...img.meta, ...m, iccTagged: Boolean(m.icc) };
  } else if (format === 'tiff') {
    const t = parseTiff(bytes);
    img.meta.orientation = typeof t?.ifds[0]?.tags.find((t) => t.tag === 0x0112)?.value === 'number'
      ? (t!.ifds[0]!.tags.find((t) => t.tag === 0x0112)!.value as number)
      : 1;
  }
  return img;
}

function applyOri(img: DecodedImage, apply: boolean): DecodedImage {
  if (!apply || img.meta.orientation <= 1) return img;
  const next = applyOrientation(img.data, img.width, img.height, img.meta.orientation);
  return {
    ...img,
    width: next.width,
    height: next.height,
    data: next.data,
    meta: { ...img.meta, orientation: 1 },
  };
}

export async function decode(input: DecodeInput, options: DecodeOptions = {}): Promise<DecodedImage> {
  const { bytes, name = '', mime = '', targetWidth } = input;
  const format = detectFormat(bytes, name, mime);
  if (!format) throw new Error(`Unbekanntes Bildformat: ${name || mime || 'bytes'}`);
  const apply = options.applyOrientation !== false;
  let img: DecodedImage;
  switch (format) {
    case 'jpeg': {
      const r = await decodeJpegJsquash(bytes);
      img = { width: r.width, height: r.height, data: r.data, meta: emptyMeta('jpeg') };
      break;
    }
    case 'png': {
      const own = decodePngOwn(bytes);
      if (own) img = { ...own, meta: emptyMeta('png') };
      else {
        const r = await decodePngJsquash(bytes);
        img = { width: r.width, height: r.height, data: r.data, meta: emptyMeta('png') };
      }
      break;
    }
    case 'apng':
      img = decodeApng(bytes);
      break;
    case 'webp': {
      const r = await decodeWebpJsquash(bytes);
      img = { width: r.width, height: r.height, data: r.data, meta: emptyMeta('webp') };
      break;
    }
    case 'avif': {
      const r = await decodeAvifJsquash(bytes);
      img = { width: r.width, height: r.height, data: r.data, meta: emptyMeta('avif') };
      break;
    }
    case 'jxl': {
      const r = await decodeJxlJsquash(bytes);
      img = { width: r.width, height: r.height, data: r.data, meta: emptyMeta('jxl') };
      break;
    }
    case 'gif':
      img = decodeGif(bytes);
      break;
    case 'bmp':
      img = decodeBmp(bytes);
      break;
    case 'tga':
      img = decodeTga(bytes);
      break;
    case 'ppm':
    case 'pgm':
    case 'pbm':
      img = decodePpm(bytes);
      break;
    case 'ico':
      img = decodeIco(bytes);
      break;
    case 'tiff':
      img = decodeTiff(bytes);
      break;
    case 'heic':
      img = await decodeHeic(bytes);
      break;
    case 'svg':
      img = await decodeSvg(bytes, targetWidth);
      break;
    default:
      throw new Error(`Decode nicht implementiert: ${format}`);
  }
  img = await attachSidecar(img, bytes, format);
  return applyOri(img, apply);
}
