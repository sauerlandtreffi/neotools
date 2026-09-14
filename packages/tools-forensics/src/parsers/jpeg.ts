import { eqAt, findBytes, fourcc, latin1, readU16BE } from '../util/bytes.js';
import { hashBytes } from '../util/hashes.js';
import { parseTiff, type TiffParse } from './tiff.js';

export interface JpegSegment {
  marker: number;
  name: string;
  offset: number;
  length: number;
  note?: string;
}

export interface JpegAutopsy {
  segments: JpegSegment[];
  progressive: boolean;
  scans: number;
  quantizationTables: number;
  hasJfif: boolean;
  hasExif: boolean;
  hasXmp: boolean;
  hasIcc: boolean;
  hasIptc: boolean;
  hasPhotoshop: boolean;
  adobe: boolean;
  exif?: TiffParse;
  xmp?: string;
  xmpHistory: boolean;
  bytesAfterEoi: number;
  eoiOffset: number;
  sof?: { precision: number; height: number; width: number; components: number };
}

const MARKERS: Record<number, string> = {
  0xd8: 'SOI',
  0xd9: 'EOI',
  0xda: 'SOS',
  0xdb: 'DQT',
  0xdd: 'DRI',
  0xc0: 'SOF0',
  0xc1: 'SOF1',
  0xc2: 'SOF2',
  0xc3: 'SOF3',
  0xc4: 'DHT',
  0xc5: 'SOF5',
  0xc6: 'SOF6',
  0xc7: 'SOF7',
  0xc8: 'JPG',
  0xc9: 'SOF9',
  0xca: 'SOF10',
  0xcb: 'SOF11',
  0xcd: 'SOF13',
  0xce: 'SOF14',
  0xcf: 'SOF15',
  0xe0: 'APP0',
  0xe1: 'APP1',
  0xe2: 'APP2',
  0xed: 'APP13',
  0xee: 'APP14',
  0xfe: 'COM',
};

function standalone(marker: number): boolean {
  return marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7);
}

export function parseJpeg(bytes: Uint8Array): JpegAutopsy | undefined {
  if (!eqAt(bytes, 0, [0xff, 0xd8])) return undefined;
  const segments: JpegSegment[] = [{ marker: 0xd8, name: 'SOI', offset: 0, length: 2 }];
  let i = 2;
  let progressive = false;
  let scans = 0;
  let quantizationTables = 0;
  let hasJfif = false;
  let hasExif = false;
  let hasXmp = false;
  let hasIcc = false;
  let hasIptc = false;
  let hasPhotoshop = false;
  let adobe = false;
  let exif: TiffParse | undefined;
  let xmp: string | undefined;
  let xmpHistory = false;
  let sof: JpegAutopsy['sof'];
  let eoiOffset = -1;

  while (i < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    while (i < bytes.length && bytes[i] === 0xff) i += 1;
    if (i >= bytes.length) break;
    const marker = bytes[i]!;
    const start = i - 1;
    i += 1;
    if (standalone(marker)) {
      segments.push({ marker, name: MARKERS[marker] ?? `M${marker.toString(16)}`, offset: start, length: 2 });
      if (marker === 0xd9) {
        eoiOffset = start;
        break;
      }
      continue;
    }
    if (i + 2 > bytes.length) break;
    const len = readU16BE(bytes, i);
    const payloadOff = i + 2;
    const payload = bytes.subarray(payloadOff, Math.min(bytes.length, payloadOff + Math.max(0, len - 2)));
    let note: string | undefined;
    if (marker === 0xe0 && latin1(payload, 0, 4) === 'JFIF') {
      hasJfif = true;
      note = 'JFIF';
    }
    if (marker === 0xe1 && latin1(payload, 0, 4) === 'Exif') {
      hasExif = true;
      note = 'Exif';
      const tiffOff = payload[4] === 0 && payload[5] === 0 ? 6 : 4;
      exif = parseTiff(payload.subarray(tiffOff));
    }
    if (marker === 0xe1 && latin1(payload, 0, 29).includes('http://ns.adobe.com/xap')) {
      hasXmp = true;
      note = 'XMP';
      const xmlStart = findBytes(payload, [0x3c]);
      if (xmlStart >= 0) {
        xmp = new TextDecoder('utf-8', { fatal: false }).decode(payload.subarray(xmlStart));
        xmpHistory = /xmpMM:History|stEvt:action/i.test(xmp);
      }
    }
    if (marker === 0xe2 && latin1(payload, 0, 11) === 'ICC_PROFILE') {
      hasIcc = true;
      note = 'ICC';
    }
    if (marker === 0xed) {
      if (latin1(payload, 0, 14).startsWith('Photoshop 3.0')) {
        hasPhotoshop = true;
        note = 'Photoshop 8BIM';
      }
      if (latin1(payload, 0, 18).includes('Photoshop') || findBytes(payload, [0x38, 0x42, 0x49, 0x4d]) >= 0) {
        hasPhotoshop = true;
        note = note ?? '8BIM';
      }
      if (latin1(payload, 0, 9) === 'Photoshop' || latin1(payload, 0, 4) === '8BIM') {
        hasIptc = true;
      }
      if (findBytes(payload, [0x1c, 0x02]) >= 0) hasIptc = true;
    }
    if (marker === 0xee && latin1(payload, 0, 5) === 'Adobe') {
      adobe = true;
      note = 'Adobe';
    }
    if (marker === 0xdb) quantizationTables += 1;
    if (marker === 0xc2) progressive = true;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (payload.length >= 6) {
        sof = {
          precision: payload[0]!,
          height: readU16BE(payload, 1),
          width: readU16BE(payload, 3),
          components: payload[5]!,
        };
      }
    }
    segments.push({
      marker,
      name: MARKERS[marker] ?? `APP${marker - 0xe0}`,
      offset: start,
      length: 2 + len,
      note,
    });
    i = payloadOff + Math.max(0, len - 2);
    if (marker === 0xda) {
      scans += 1;
      while (i < bytes.length) {
        if (bytes[i] === 0xff && bytes[i + 1] !== 0x00 && !(bytes[i + 1]! >= 0xd0 && bytes[i + 1]! <= 0xd7)) {
          break;
        }
        i += 1;
      }
    }
  }

  const bytesAfterEoi = eoiOffset >= 0 ? Math.max(0, bytes.length - (eoiOffset + 2)) : 0;
  return {
    segments,
    progressive,
    scans,
    quantizationTables,
    hasJfif,
    hasExif,
    hasXmp,
    hasIcc,
    hasIptc,
    hasPhotoshop,
    adobe,
    exif,
    xmp,
    xmpHistory,
    bytesAfterEoi,
    eoiOffset,
    sof,
  };
}

export function jpegThumbnailInfo(bytes: Uint8Array, jpeg: JpegAutopsy): { present: boolean; size?: number; hash?: string; differs?: boolean } {
  const thumb = jpeg.exif?.thumbnail;
  if (!thumb || thumb.length <= 0) return { present: false };
  const slice = bytes.subarray(thumb.offset, Math.min(bytes.length, thumb.offset + thumb.length));
  const hash = hashBytes('sha256', slice);
  const main = hashBytes('sha256', bytes.subarray(0, jpeg.eoiOffset >= 0 ? jpeg.eoiOffset + 2 : bytes.length));
  return { present: true, size: slice.length, hash, differs: hash !== main };
}

export function injectJpegSegment(jpeg: Uint8Array, segment: Uint8Array): Uint8Array {
  if (!eqAt(jpeg, 0, [0xff, 0xd8])) return jpeg;
  const out = new Uint8Array(jpeg.length + segment.length);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(segment, 2);
  out.set(jpeg.subarray(2), 2 + segment.length);
  return out;
}

void fourcc;
