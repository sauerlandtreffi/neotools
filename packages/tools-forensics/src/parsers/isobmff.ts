import { fourcc, latin1, readI32BE, readU16BE, readU32BE } from '../util/bytes.js';

export interface BmffBox {
  type: string;
  offset: number;
  size: number;
  children?: BmffBox[];
  attrs?: Record<string, unknown>;
}

export interface IsoBmffAutopsy {
  brands: { major: string; compatible: string[] };
  boxes: BmffBox[];
  tracks: Array<{
    id?: number;
    handler?: string;
    codec?: string;
    duration?: number;
    rotation?: number;
  }>;
  duration?: number;
  timescale?: number;
  metadata: Record<string, string>;
}

function boxSize(bytes: Uint8Array, offset: number): { size: number; header: number } {
  let size = readU32BE(bytes, offset);
  let header = 8;
  if (size === 1 && offset + 16 <= bytes.length) {
    const hi = readU32BE(bytes, offset + 8);
    const lo = readU32BE(bytes, offset + 12);
    size = hi * 0x100000000 + lo;
    header = 16;
  } else if (size === 0) {
    size = bytes.length - offset;
  }
  return { size, header };
}

const CONTAINERS = new Set([
  'moov',
  'trak',
  'mdia',
  'minf',
  'stbl',
  'udta',
  'meta',
  'ilst',
  'edts',
  'dinf',
  'mvex',
  'moof',
  'traf',
]);

function parseBoxes(bytes: Uint8Array, start: number, end: number, depth: number): BmffBox[] {
  const boxes: BmffBox[] = [];
  let i = start;
  while (i + 8 <= end && boxes.length < 400) {
    const type = fourcc(bytes, i + 4);
    const { size, header } = boxSize(bytes, i);
    if (size < 8 || i + size > end + 8) {
      if (size < 8) break;
    }
    const boxEnd = Math.min(end, i + Math.max(size, header));
    const box: BmffBox = { type, offset: i, size: boxEnd - i };
    const payload = bytes.subarray(i + header, boxEnd);
    if (type === 'ftyp' && payload.length >= 8) {
      const compatible: string[] = [];
      for (let k = 8; k + 4 <= payload.length; k += 4) compatible.push(fourcc(payload, k));
      box.attrs = { major: fourcc(payload, 0), compatible };
    }
    if (type === 'mvhd' && payload.length >= 20) {
      const version = payload[0]!;
      if (version === 0 && payload.length >= 24) {
        box.attrs = { timescale: readU32BE(payload, 12), duration: readU32BE(payload, 16) };
      }
    }
    if (type === 'tkhd' && payload.length >= 84) {
      const version = payload[0]!;
      const idOff = version === 1 ? 20 : 12;
      const matrixOff = version === 1 ? 48 : 40;
      const id = readU32BE(payload, idOff);
      const a = readI32BE(payload, matrixOff) / 65536;
      const b = readI32BE(payload, matrixOff + 4) / 65536;
      const rotation = (Math.atan2(b, a) * 180) / Math.PI;
      box.attrs = { trackId: id, rotation: Math.round(rotation * 10) / 10 };
    }
    if (type === 'hdlr' && payload.length >= 16) {
      box.attrs = { handler: fourcc(payload, 8) };
    }
    if (type === 'stsd' && payload.length >= 16) {
      box.attrs = { codec: fourcc(payload, 12) };
    }
    if (type === 'mdhd' && payload.length >= 24) {
      const version = payload[0]!;
      if (version === 0) box.attrs = { timescale: readU32BE(payload, 12), duration: readU32BE(payload, 16) };
    }
    if (CONTAINERS.has(type) && depth < 10) {
      let childStart = i + header;
      if (type === 'meta' && payload[0] === 0) childStart += 4;
      box.children = parseBoxes(bytes, childStart, boxEnd, depth + 1);
    }
    boxes.push(box);
    if (size <= header) break;
    i += size;
  }
  return boxes;
}

function walk(boxes: BmffBox[], fn: (b: BmffBox, trail: string[]) => void, trail: string[] = []): void {
  for (const b of boxes) {
    fn(b, trail);
    if (b.children) walk(b.children, fn, [...trail, b.type]);
  }
}

export function parseIsoBmff(bytes: Uint8Array): IsoBmffAutopsy | undefined {
  if (bytes.length < 16 || fourcc(bytes, 4) !== 'ftyp') return undefined;
  const boxes = parseBoxes(bytes, 0, bytes.length, 0);
  const ftyp = boxes.find((b) => b.type === 'ftyp');
  const brands = {
    major: String(ftyp?.attrs?.major ?? ''),
    compatible: (ftyp?.attrs?.compatible as string[] | undefined) ?? [],
  };
  const tracks: IsoBmffAutopsy['tracks'] = [];
  let duration: number | undefined;
  let timescale: number | undefined;
  const metadata: Record<string, string> = {};
  let current: IsoBmffAutopsy['tracks'][number] | undefined;

  walk(boxes, (b) => {
    if (b.type === 'mvhd') {
      timescale = Number(b.attrs?.timescale);
      duration = Number(b.attrs?.duration);
    }
    if (b.type === 'trak') {
      current = {};
      tracks.push(current);
    }
    if (current && b.type === 'tkhd') {
      current.id = Number(b.attrs?.trackId);
      current.rotation = Number(b.attrs?.rotation);
    }
    if (current && b.type === 'hdlr') current.handler = String(b.attrs?.handler ?? '');
    if (current && b.type === 'stsd') current.codec = String(b.attrs?.codec ?? '');
    if (current && b.type === 'mdhd') current.duration = Number(b.attrs?.duration);
    if ((b.type === '©nam' || b.type === '©ART' || b.type === '©cmt') && b.size > 16) {
      metadata[b.type] = latin1(bytes, b.offset + 16, Math.min(80, b.size - 16)).replace(/\0/g, '').trim();
    }
  });

  return { brands, boxes, tracks, duration, timescale, metadata };
}

export function buildMinimalMp4(): Uint8Array {
  const ftyp = new Uint8Array(24);
  ftyp[3] = 24;
  ftyp.set([0x66, 0x74, 0x79, 0x70], 4);
  ftyp.set([0x69, 0x73, 0x6f, 0x6d], 8);
  ftyp[14] = 0x02;
  ftyp.set([0x69, 0x73, 0x6f, 0x6d], 16);
  ftyp.set([0x6d, 0x70, 0x34, 0x31], 20);

  const mvhd = new Uint8Array(108);
  mvhd[3] = 108;
  mvhd.set([0x6d, 0x76, 0x68, 0x64], 4);
  mvhd[20] = 0x00;
  mvhd[21] = 0x00;
  mvhd[22] = 0x03;
  mvhd[23] = 0xe8; // timescale 1000
  mvhd[26] = 0x13;
  mvhd[27] = 0x88; // duration 5000

  const tkhd = new Uint8Array(92);
  tkhd[3] = 92;
  tkhd.set([0x74, 0x6b, 0x68, 0x64], 4);
  tkhd[23] = 1; // track id
  // identity matrix at offset 48 of payload = 56 of box; rotation 0
  tkhd[48 + 8] = 0x00;
  tkhd[49 + 8] = 0x01; // a = 1.0 (16.16 at matrix[0]) — rough

  const hdlr = new Uint8Array(32);
  hdlr[3] = 32;
  hdlr.set([0x68, 0x64, 0x6c, 0x72], 4);
  hdlr.set([0x76, 0x69, 0x64, 0x65], 16);

  const stsd = new Uint8Array(24);
  stsd[3] = 24;
  stsd.set([0x73, 0x74, 0x73, 0x64], 4);
  stsd[15] = 1;
  stsd.set([0x61, 0x76, 0x63, 0x31], 16);

  const stblSize = 8 + stsd.length;
  const stbl = new Uint8Array(stblSize);
  stbl[3] = stblSize;
  stbl.set([0x73, 0x74, 0x62, 0x6c], 4);
  stbl.set(stsd, 8);

  const minfSize = 8 + stbl.length;
  const minf = new Uint8Array(minfSize);
  minf[3] = minfSize;
  minf.set([0x6d, 0x69, 0x6e, 0x66], 4);
  minf.set(stbl, 8);

  const mdiaSize = 8 + hdlr.length + minf.length;
  const mdia = new Uint8Array(mdiaSize);
  mdia[3] = mdiaSize;
  mdia.set([0x6d, 0x64, 0x69, 0x61], 4);
  mdia.set(hdlr, 8);
  mdia.set(minf, 8 + hdlr.length);

  const trakSize = 8 + tkhd.length + mdia.length;
  const trak = new Uint8Array(trakSize);
  trak[3] = trakSize;
  trak.set([0x74, 0x72, 0x61, 0x6b], 4);
  trak.set(tkhd, 8);
  trak.set(mdia, 8 + tkhd.length);

  const moovSize = 8 + mvhd.length + trak.length;
  const moov = new Uint8Array(moovSize);
  moov[3] = moovSize;
  moov.set([0x6d, 0x6f, 0x6f, 0x76], 4);
  moov.set(mvhd, 8);
  moov.set(trak, 8 + mvhd.length);

  const out = new Uint8Array(ftyp.length + moov.length);
  out.set(ftyp, 0);
  out.set(moov, ftyp.length);
  return out;
}

void readU16BE;
