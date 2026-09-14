import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';
import { decodeJpeg, decodePngOxipng, downsample, encodeJpeg, encodePngOxipng, toGrayscale } from '../codecs/jsquash.js';
import type { RasterImage } from '../codecs/jsquash.js';

export type ImageFilter = 'DCT' | 'Flate' | 'JPX' | 'CCITT' | 'other';

export interface ImageDecision {
  name: string;
  filter: ImageFilter;
  beforeBytes: number;
  afterBytes: number;
  action: 'recompressed' | 'kept' | 'skipped';
  reason?: string;
}

function nameOf(n: PDFName): string {
  return n.toString().replace(/^\//, '');
}

function filtersOf(dict: PDFDict): string[] {
  const f = dict.lookup(PDFName.of('Filter'));
  if (f instanceof PDFName) return [nameOf(f)];
  if (f instanceof PDFArray) {
    const out: string[] = [];
    for (let i = 0; i < f.size(); i++) {
      const item = f.lookup(i);
      if (item instanceof PDFName) out.push(nameOf(item));
    }
    return out;
  }
  return [];
}

function classify(filters: string[]): ImageFilter {
  if (filters.some((f) => f === 'DCTDecode' || f === 'DCT')) return 'DCT';
  if (filters.some((f) => f === 'JPXDecode' || f === 'JPX')) return 'JPX';
  if (filters.some((f) => f === 'CCITTFaxDecode' || f === 'CCITTFax')) return 'CCITT';
  if (filters.some((f) => f === 'FlateDecode' || f === 'Flate')) return 'Flate';
  return 'other';
}

export interface CompressImageOpts {
  dpi: number;
  quality: number;
  grayscale: boolean;
  pageWidthPt: number;
  pageHeightPt: number;
}

async function pixelsFromStream(stream: PDFRawStream, filter: ImageFilter): Promise<RasterImage | null> {
  const dict = stream.dict;
  const width = (dict.lookup(PDFName.of('Width')) as { asNumber?: () => number } | undefined)?.asNumber?.();
  const height = (dict.lookup(PDFName.of('Height')) as { asNumber?: () => number } | undefined)?.asNumber?.();
  if (filter === 'DCT') {
    try {
      return await decodeJpeg(stream.contents);
    } catch {
      return null;
    }
  }
  try {
    const decoded = decodePDFRawStream(stream).decode();
    if (filter === 'Flate' && width && height) {
      const cs = dict.lookup(PDFName.of('ColorSpace'));
      const csName = cs instanceof PDFName ? nameOf(cs) : '';
      const bpp = csName === 'DeviceGray' ? 1 : 3;
      if (decoded.length >= width * height * bpp) {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i++) {
          if (bpp === 1) {
            const g = decoded[i]!;
            data[i * 4] = g;
            data[i * 4 + 1] = g;
            data[i * 4 + 2] = g;
            data[i * 4 + 3] = 255;
          } else {
            data[i * 4] = decoded[i * 3]!;
            data[i * 4 + 1] = decoded[i * 3 + 1]!;
            data[i * 4 + 2] = decoded[i * 3 + 2]!;
            data[i * 4 + 3] = 255;
          }
        }
        return { data, width, height };
      }
    }
    if (decoded[0] === 0x89 && decoded[1] === 0x50) {
      try {
        return await decodePngOxipng(decoded);
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function walkXObjects(
  xobjects: PDFDict,
  doc: PDFDocument,
  opts: CompressImageOpts,
  decisions: ImageDecision[],
  warnings: string[],
  seen: Set<PDFDict>,
): Promise<void> {
  if (seen.has(xobjects)) return;
  seen.add(xobjects);
  for (const key of xobjects.keys()) {
    const obj = xobjects.lookup(key);
    if (obj instanceof PDFDict && !(obj instanceof PDFRawStream)) {
      const subtype = obj.lookup(PDFName.of('Subtype'));
      if (subtype instanceof PDFName && nameOf(subtype) === 'Form') {
        const res = obj.lookupMaybe(PDFName.of('Resources'), PDFDict);
        const nested = res?.lookupMaybe(PDFName.of('XObject'), PDFDict);
        if (nested) await walkXObjects(nested, doc, opts, decisions, warnings, seen);
      }
      continue;
    }
    if (!(obj instanceof PDFRawStream)) continue;
    const subtype = obj.dict.lookup(PDFName.of('Subtype'));
    if (!(subtype instanceof PDFName) || nameOf(subtype) !== 'Image') continue;
    const filters = filtersOf(obj.dict);
    const filter = classify(filters);
    const before = obj.contents.byteLength;
    const label = nameOf(key);

    if (filter === 'JPX') {
      decisions.push({ name: label, filter, beforeBytes: before, afterBytes: before, action: 'skipped', reason: 'JPX nicht behandelt' });
      warnings.push(`${label}: JPX (JPEG 2000) wird nicht rekodiert.`);
      continue;
    }
    if (filter === 'CCITT') {
      decisions.push({ name: label, filter, beforeBytes: before, afterBytes: before, action: 'skipped', reason: 'CCITT nicht behandelt' });
      warnings.push(`${label}: CCITT-Fax wird nicht rekodiert.`);
      continue;
    }

    const pixels = await pixelsFromStream(obj, filter);
    if (!pixels) {
      decisions.push({ name: label, filter, beforeBytes: before, afterBytes: before, action: 'skipped', reason: 'Decode fehlgeschlagen' });
      continue;
    }

    const maxW = Math.max(1, Math.round((opts.pageWidthPt / 72) * opts.dpi));
    const maxH = Math.max(1, Math.round((opts.pageHeightPt / 72) * opts.dpi));
    let raster = downsample(pixels, maxW, maxH);
    if (opts.grayscale) raster = toGrayscale(raster);

    let next: Uint8Array;
    try {
      next = await encodeJpeg(raster, opts.quality);
    } catch {
      try {
        next = await encodePngOxipng(raster);
      } catch {
        decisions.push({ name: label, filter, beforeBytes: before, afterBytes: before, action: 'kept', reason: 'Encode fehlgeschlagen' });
        continue;
      }
    }
    if (next.byteLength >= before) {
      decisions.push({ name: label, filter, beforeBytes: before, afterBytes: before, action: 'kept', reason: 'nicht kleiner' });
      continue;
    }
    const isJpeg = next[0] === 0xff && next[1] === 0xd8;
    const embedded = isJpeg ? await doc.embedJpg(next) : await doc.embedPng(next);
    xobjects.set(key, embedded.ref);
    decisions.push({ name: label, filter, beforeBytes: before, afterBytes: next.byteLength, action: 'recompressed' });
  }
}

export async function recompressPageImages(
  doc: PDFDocument,
  opts: CompressImageOpts,
  onPage?: (index: number, total: number) => void,
): Promise<{ decisions: ImageDecision[]; warnings: string[] }> {
  const decisions: ImageDecision[] = [];
  const warnings: string[] = [];
  const seen = new Set<PDFDict>();
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    onPage?.(i + 1, pages.length);
    const page = pages[i]!;
    const { width, height } = page.getSize();
    const pageOpts = { ...opts, pageWidthPt: width, pageHeightPt: height };
    const res = page.node.lookupMaybe(PDFName.of('Resources'), PDFDict);
    const xobjects = res?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (xobjects) await walkXObjects(xobjects, doc, pageOpts, decisions, warnings, seen);
  }
  return { decisions, warnings };
}
