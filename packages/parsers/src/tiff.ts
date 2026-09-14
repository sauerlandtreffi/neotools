import { cstr, readU16BE, readU16LE, readU32BE, readU32LE } from './bytes.js';

export interface TiffTag {
  tag: number;
  name: string;
  type: number;
  count: number;
  value: unknown;
}

export interface TiffIfd {
  offset: number;
  tags: TiffTag[];
}

export interface TiffParse {
  littleEndian: boolean;
  ifds: TiffIfd[];
  software?: string;
  make?: string;
  model?: string;
  datetime?: string;
  serial?: string;
  gps?: { lat?: number; lon?: number; raw: Record<string, unknown> };
  thumbnail?: { offset: number; length: number; hashHint?: string };
  imageWidth?: number;
  imageHeight?: number;
}

const TAG_NAMES: Record<number, string> = {
  0x0100: 'ImageWidth',
  0x0101: 'ImageLength',
  0x0103: 'Compression',
  0x010f: 'Make',
  0x0110: 'Model',
  0x0112: 'Orientation',
  0x011a: 'XResolution',
  0x011b: 'YResolution',
  0x0131: 'Software',
  0x0132: 'DateTime',
  0x013b: 'Artist',
  0x010e: 'ImageDescription',
  0x8298: 'Copyright',
  0x8769: 'ExifIFD',
  0x8825: 'GPSIFD',
  0x0201: 'JPEGInterchangeFormat',
  0x0202: 'JPEGInterchangeFormatLength',
  0xa431: 'BodySerialNumber',
  0xa435: 'LensSerialNumber',
  0xc62f: 'CameraSerialNumber',
  0x0001: 'GPSLatitudeRef',
  0x0002: 'GPSLatitude',
  0x0003: 'GPSLongitudeRef',
  0x0004: 'GPSLongitude',
};

function u16(bytes: Uint8Array, off: number, le: boolean): number {
  return le ? readU16LE(bytes, off) : readU16BE(bytes, off);
}
function u32(bytes: Uint8Array, off: number, le: boolean): number {
  return le ? readU32LE(bytes, off) : readU32BE(bytes, off);
}

function typeSize(t: number): number {
  switch (t) {
    case 1:
    case 2:
    case 6:
    case 7:
      return 1;
    case 3:
    case 8:
      return 2;
    case 4:
    case 9:
    case 11:
      return 4;
    case 5:
    case 10:
    case 12:
      return 8;
    default:
      return 1;
  }
}

function decodeValue(bytes: Uint8Array, type: number, count: number, offset: number, le: boolean): unknown {
  if (type === 2) {
    return cstr(bytes, offset, count);
  }
  if (type === 5 || type === 10) {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < count && offset + i * 8 + 8 <= bytes.length; i++) {
      const n = u32(bytes, offset + i * 8, le);
      const d = u32(bytes, offset + i * 8 + 4, le) || 1;
      out.push([n, d]);
    }
    return out;
  }
  if (count === 1) {
    if (type === 3) return u16(bytes, offset, le);
    if (type === 4 || type === 9) return u32(bytes, offset, le);
    if (type === 1 || type === 7) return bytes[offset];
  }
  if (type === 3 && count <= 16) {
    const arr: number[] = [];
    for (let i = 0; i < count; i++) arr.push(u16(bytes, offset + i * 2, le));
    return arr;
  }
  return { offset, count, type };
}

function readIfd(bytes: Uint8Array, offset: number, le: boolean, base: number): TiffIfd | undefined {
  if (offset + 2 > bytes.length) return undefined;
  const count = u16(bytes, offset, le);
  const tags: TiffTag[] = [];
  for (let i = 0; i < count; i++) {
    const p = offset + 2 + i * 12;
    if (p + 12 > bytes.length) break;
    const tag = u16(bytes, p, le);
    const type = u16(bytes, p + 2, le);
    const n = u32(bytes, p + 4, le);
    const inline = p + 8;
    const size = typeSize(type) * n;
    let dataOff = inline;
    if (size > 4) dataOff = base + u32(bytes, inline, le);
    if (dataOff < 0 || dataOff >= bytes.length) continue;
    tags.push({
      tag,
      name: TAG_NAMES[tag] ?? `0x${tag.toString(16)}`,
      type,
      count: n,
      value: decodeValue(bytes, type, n, dataOff, le),
    });
  }
  return { offset, tags };
}

function tagVal(ifd: TiffIfd | undefined, tag: number): unknown {
  return ifd?.tags.find((t) => t.tag === tag)?.value;
}

function gpsRational(v: unknown): number | undefined {
  if (!Array.isArray(v) || v.length < 3) return undefined;
  const part = (x: unknown) => {
    if (Array.isArray(x) && x.length === 2) return Number(x[0]) / (Number(x[1]) || 1);
    return Number(x);
  };
  const d = part(v[0]);
  const m = part(v[1]);
  const s = part(v[2]);
  if (![d, m, s].every((n) => Number.isFinite(n))) return undefined;
  return d + m / 60 + s / 3600;
}

export function parseTiff(bytes: Uint8Array, base = 0): TiffParse | undefined {
  const view = bytes.subarray(base);
  if (view.length < 8) return undefined;
  let le = false;
  if (view[0] === 0x49 && view[1] === 0x49) le = true;
  else if (view[0] === 0x4d && view[1] === 0x4d) le = false;
  else return undefined;
  const magic = u16(view, 2, le);
  if (magic !== 42) return undefined;
  const first = u32(view, 4, le);
  const ifds: TiffIfd[] = [];
  let next = first;
  const seen = new Set<number>();
  while (next && !seen.has(next) && ifds.length < 8) {
    seen.add(next);
    const ifd = readIfd(view, next, le, 0);
    if (!ifd) break;
    ifds.push(ifd);
    const count = u16(view, next, le);
    const npos = next + 2 + count * 12;
    if (npos + 4 > view.length) break;
    next = u32(view, npos, le);
  }

  const ifd0 = ifds[0];
  const ifd1 = ifds[1];
  const software = typeof tagVal(ifd0, 0x0131) === 'string' ? (tagVal(ifd0, 0x0131) as string) : undefined;
  const make = typeof tagVal(ifd0, 0x010f) === 'string' ? (tagVal(ifd0, 0x010f) as string) : undefined;
  const model = typeof tagVal(ifd0, 0x0110) === 'string' ? (tagVal(ifd0, 0x0110) as string) : undefined;
  const datetime = typeof tagVal(ifd0, 0x0132) === 'string' ? (tagVal(ifd0, 0x0132) as string) : undefined;
  const serial =
    (typeof tagVal(ifd0, 0xa431) === 'string' && (tagVal(ifd0, 0xa431) as string)) ||
    (typeof tagVal(ifd0, 0xc62f) === 'string' && (tagVal(ifd0, 0xc62f) as string)) ||
    undefined;

  let gps: TiffParse['gps'];
  const gpsPtr = tagVal(ifd0, 0x8825);
  if (typeof gpsPtr === 'number') {
    const gpsIfd = readIfd(view, gpsPtr, le, 0);
    if (gpsIfd) {
      const lat = gpsRational(tagVal(gpsIfd, 0x0002));
      const lon = gpsRational(tagVal(gpsIfd, 0x0004));
      const latRef = tagVal(gpsIfd, 0x0001);
      const lonRef = tagVal(gpsIfd, 0x0003);
      const signedLat = lat !== undefined && String(latRef).toUpperCase().startsWith('S') ? -lat : lat;
      const signedLon = lon !== undefined && String(lonRef).toUpperCase().startsWith('W') ? -lon : lon;
      const raw: Record<string, unknown> = {};
      for (const t of gpsIfd.tags) raw[t.name] = t.value;
      gps = { lat: signedLat, lon: signedLon, raw };
    }
  }

  let thumbnail: TiffParse['thumbnail'];
  const thumbOff = tagVal(ifd1, 0x0201);
  const thumbLen = tagVal(ifd1, 0x0202);
  if (typeof thumbOff === 'number' && typeof thumbLen === 'number' && thumbLen > 0) {
    thumbnail = { offset: base + thumbOff, length: thumbLen };
  }

  const imageWidth = typeof tagVal(ifd0, 0x0100) === 'number' ? (tagVal(ifd0, 0x0100) as number) : undefined;
  const imageHeight = typeof tagVal(ifd0, 0x0101) === 'number' ? (tagVal(ifd0, 0x0101) as number) : undefined;

  return {
    littleEndian: le,
    ifds,
    software,
    make,
    model,
    datetime,
    serial,
    gps,
    thumbnail,
    imageWidth,
    imageHeight,
  };
}

export function buildExifApp1(opts: {
  software?: string;
  gps?: { lat: number; lon: number };
  thumbnail?: Uint8Array;
}): Uint8Array {
  const body: number[] = [];
  const pushStr = (s: string) => {
    for (let i = 0; i < s.length; i++) body.push(s.charCodeAt(i));
    body.push(0);
  };
  // We'll assemble a simple LE TIFF: header + IFD0 (Software + optional GPS) + strings + optional IFD1
  const tiff: number[] = [0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0];
  const tags: Array<{ tag: number; type: number; count: number; value: number | string }> = [];
  if (opts.software) tags.push({ tag: 0x0131, type: 2, count: opts.software.length + 1, value: opts.software });
  if (opts.gps) tags.push({ tag: 0x8825, type: 4, count: 1, value: 0 }); // patched later
  const ifdCount = tags.length;
  // placeholder; we write properly below
  void ifdCount;
  void pushStr;
  void tiff;

  const chunks: number[] = [];
  const write16 = (n: number) => {
    chunks.push(n & 0xff, (n >> 8) & 0xff);
  };
  const write32 = (n: number) => {
    chunks.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff);
  };

  const header = [0x49, 0x49, 0x2a, 0x00];
  const afterHeader = 8;
  const ifd0tags: Array<{ tag: number; type: number; count: number; inline: number; extra?: number[] }> = [];
  const extras: number[] = [];
  let extraBase = 0;

  const addAscii = (tag: number, text: string) => {
    const bytes = [...text].map((c) => c.charCodeAt(0)).concat(0);
    if (bytes.length <= 4) {
      let inline = 0;
      for (let i = 0; i < bytes.length; i++) inline |= bytes[i]! << (8 * i);
      ifd0tags.push({ tag, type: 2, count: bytes.length, inline });
    } else {
      ifd0tags.push({ tag, type: 2, count: bytes.length, inline: 0, extra: bytes });
    }
  };
  if (opts.software) addAscii(0x0131, opts.software);

  const gpsExtras: number[] = [];
  if (opts.gps) {
    ifd0tags.push({ tag: 0x8825, type: 4, count: 1, inline: 0 });
  }

  const ifd0Size = 2 + ifd0tags.length * 12 + 4;
  extraBase = afterHeader + ifd0Size;
  let extraOff = extraBase;
  for (const t of ifd0tags) {
    if (t.extra) {
      t.inline = extraOff;
      extras.push(...t.extra);
      extraOff += t.extra.length;
    }
  }

  let gpsIfdOff = 0;
  if (opts.gps) {
    gpsIfdOff = extraOff;
    const latRef = opts.gps.lat < 0 ? 'S' : 'N';
    const lonRef = opts.gps.lon < 0 ? 'W' : 'E';
    const toR = (deg: number) => {
      const a = Math.abs(deg);
      const d = Math.floor(a);
      const m = Math.floor((a - d) * 60);
      const s = Math.round(((a - d) * 60 - m) * 60 * 1000);
      return [d, 1, m, 1, s, 1000];
    };
    const lat = toR(opts.gps.lat);
    const lon = toR(opts.gps.lon);
    // GPS IFD: 4 tags
    const gpsCount = 4;
    const gpsIfdLen = 2 + gpsCount * 12 + 4;
    extraOff += gpsIfdLen;
    const latRefOff = extraOff;
    extraOff += 2;
    const lonRefOff = extraOff;
    extraOff += 2;
    const latOff = extraOff;
    extraOff += 24;
    const lonOff = extraOff;
    extraOff += 24;

    const gpsIfd: number[] = [];
    const w16 = (n: number) => gpsIfd.push(n & 0xff, (n >> 8) & 0xff);
    const w32 = (n: number) => gpsIfd.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff);
    w16(gpsCount);
    w16(0x0001);
    w16(2);
    w32(2);
    w32(latRefOff);
    w16(0x0002);
    w16(5);
    w32(3);
    w32(latOff);
    w16(0x0003);
    w16(2);
    w32(2);
    w32(lonRefOff);
    w16(0x0004);
    w16(5);
    w32(3);
    w32(lonOff);
    w32(0);
    gpsExtras.push(...gpsIfd);
    gpsExtras.push(latRef.charCodeAt(0), 0);
    gpsExtras.push(lonRef.charCodeAt(0), 0);
    const pushRats = (vals: number[]) => {
      for (const v of vals) {
        gpsExtras.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
      }
    };
    pushRats(lat);
    pushRats(lon);
    const gpsPtr = ifd0tags.find((t) => t.tag === 0x8825);
    if (gpsPtr) gpsPtr.inline = gpsIfdOff;
  }

  chunks.push(...header);
  write32(afterHeader);
  write16(ifd0tags.length);
  for (const t of ifd0tags) {
    write16(t.tag);
    write16(t.type);
    write32(t.count);
    write32(t.inline);
  }
  write32(0);
  chunks.push(...extras);
  chunks.push(...gpsExtras);

  const tiffBytes = Uint8Array.from(chunks);
  const payload = new Uint8Array(6 + tiffBytes.length);
  payload.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
  payload.set(tiffBytes, 6);
  const seg = new Uint8Array(4 + payload.length);
  seg[0] = 0xff;
  seg[1] = 0xe1;
  const len = payload.length + 2;
  seg[2] = (len >> 8) & 0xff;
  seg[3] = len & 0xff;
  seg.set(payload, 4);
  return seg;
}
