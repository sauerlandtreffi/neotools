import { parseTiff, type TiffParse } from '@neotools/parsers';

export interface ExifWriteFields {
  copyright?: string;
  artist?: string;
  description?: string;
  datetime?: string;
  datetimeOriginal?: string;
  offsetTimeOriginal?: string;
  software?: string;
  make?: string;
  model?: string;
  gps?: { lat: number; lon: number };
  orientation?: number;
}

type Tag = { tag: number; type: number; count: number; bytes: number[] };

function ascii(tag: number, text: string): Tag {
  const b = [...new TextEncoder().encode(text), 0];
  return { tag, type: 2, count: b.length, bytes: b };
}

function short(tag: number, value: number): Tag {
  return { tag, type: 3, count: 1, bytes: [value & 0xff, (value >> 8) & 0xff, 0, 0] };
}

function long(tag: number, value: number): Tag {
  return {
    tag,
    type: 4,
    count: 1,
    bytes: [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff],
  };
}

function rats(tag: number, vals: number[]): Tag {
  const bytes: number[] = [];
  for (const v of vals) {
    bytes.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  }
  return { tag, type: 5, count: vals.length / 2, bytes };
}

function w16(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff];
}
function w32(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
}

function writeIfd(tags: Tag[], next = 0): { bytes: number[]; extras: number[] } {
  tags.sort((a, b) => a.tag - b.tag);
  const extras: number[] = [];
  const entries: number[] = [];
  const ifdSize = 2 + tags.length * 12 + 4;
  let extraOff = ifdSize; // relative; caller adds base
  const patched: Array<{ extraAt: number; size: number }> = [];
  void patched;
  const relExtras: Array<{ tagIndex: number; data: number[] }> = [];
  tags.forEach((t, i) => {
    const inline = t.bytes.length <= 4;
    const packed = inline ? [...t.bytes, 0, 0, 0, 0].slice(0, 4) : w32(0);
    entries.push(...w16(t.tag), ...w16(t.type), ...w32(t.count), ...packed);
    if (!inline) relExtras.push({ tagIndex: i, data: t.bytes });
  });
  for (const e of relExtras) {
    const slot = e.tagIndex * 12 + 8;
    const off = extraOff;
    entries[slot] = off & 0xff;
    entries[slot + 1] = (off >> 8) & 0xff;
    entries[slot + 2] = (off >> 16) & 0xff;
    entries[slot + 3] = (off >>> 24) & 0xff;
    extras.push(...e.data);
    extraOff += e.data.length;
  }
  const bytes = [...w16(tags.length), ...entries, ...w32(next)];
  return { bytes, extras };
}

function degToRat(deg: number): number[] {
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  const s = Math.round(((a - d) * 60 - m) * 60 * 10000);
  return [d, 1, m, 1, s, 10000];
}

export function buildExifTiff(fields: ExifWriteFields): Uint8Array {
  const ifd0: Tag[] = [];
  if (fields.description) ifd0.push(ascii(0x010e, fields.description));
  if (fields.make) ifd0.push(ascii(0x010f, fields.make));
  if (fields.model) ifd0.push(ascii(0x0110, fields.model));
  if (fields.orientation) ifd0.push(short(0x0112, fields.orientation));
  if (fields.software) ifd0.push(ascii(0x0131, fields.software));
  if (fields.datetime) ifd0.push(ascii(0x0132, fields.datetime));
  if (fields.artist) ifd0.push(ascii(0x013b, fields.artist));
  if (fields.copyright) ifd0.push(ascii(0x8298, fields.copyright));

  const exifIfd: Tag[] = [];
  if (fields.datetimeOriginal) exifIfd.push(ascii(0x9003, fields.datetimeOriginal));
  if (fields.offsetTimeOriginal) exifIfd.push(ascii(0x9011, fields.offsetTimeOriginal));
  if (fields.datetime) exifIfd.push(ascii(0x9004, fields.datetime));

  const gpsIfd: Tag[] = [];
  if (fields.gps) {
    const latRef = fields.gps.lat < 0 ? 'S' : 'N';
    const lonRef = fields.gps.lon < 0 ? 'W' : 'E';
    gpsIfd.push(ascii(0x0001, latRef));
    gpsIfd.push(rats(0x0002, degToRat(fields.gps.lat)));
    gpsIfd.push(ascii(0x0003, lonRef));
    gpsIfd.push(rats(0x0004, degToRat(fields.gps.lon)));
  }

  if (exifIfd.length) ifd0.push(long(0x8769, 0));
  if (gpsIfd.length) ifd0.push(long(0x8825, 0));

  const header = [0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0];
  const ifd0w = writeIfd(ifd0, 0);
  const base0 = 8;
  let cursor = base0 + ifd0w.bytes.length + ifd0w.extras.length;

  const patchPtr = (tag: number, value: number) => {
    const count = ifd0w.bytes[0]! | (ifd0w.bytes[1]! << 8);
    for (let i = 0; i < count; i++) {
      const p = 2 + i * 12;
      const t = ifd0w.bytes[p]! | (ifd0w.bytes[p + 1]! << 8);
      if (t === tag) {
        const v = w32(value);
        ifd0w.bytes[p + 8] = v[0]!;
        ifd0w.bytes[p + 9] = v[1]!;
        ifd0w.bytes[p + 10] = v[2]!;
        ifd0w.bytes[p + 11] = v[3]!;
      }
    }
  };

  let exifBytes: number[] = [];
  if (exifIfd.length) {
    patchPtr(0x8769, cursor);
    const w = writeIfd(exifIfd, 0);
    // rewrite extra offsets relative to cursor
    const count = w.bytes[0]! | (w.bytes[1]! << 8);
    for (let i = 0; i < count; i++) {
      const p = 2 + i * 12;
      const type = w.bytes[p + 2]! | (w.bytes[p + 3]! << 8);
      const cnt = w.bytes[p + 4]! | (w.bytes[p + 5]! << 8) | (w.bytes[p + 6]! << 16) | (w.bytes[p + 7]! << 24);
      const size = (type === 2 ? 1 : type === 5 ? 8 : 1) * cnt;
      if (size > 4) {
        const rel = w.bytes[p + 8]! | (w.bytes[p + 9]! << 8) | (w.bytes[p + 10]! << 16) | (w.bytes[p + 11]! << 24);
        const abs = w32(cursor + rel);
        w.bytes[p + 8] = abs[0]!;
        w.bytes[p + 9] = abs[1]!;
        w.bytes[p + 10] = abs[2]!;
        w.bytes[p + 11] = abs[3]!;
      }
    }
    exifBytes = [...w.bytes, ...w.extras];
    cursor += exifBytes.length;
  }

  let gpsBytes: number[] = [];
  if (gpsIfd.length) {
    patchPtr(0x8825, cursor);
    const w = writeIfd(gpsIfd, 0);
    const count = w.bytes[0]! | (w.bytes[1]! << 8);
    for (let i = 0; i < count; i++) {
      const p = 2 + i * 12;
      const type = w.bytes[p + 2]! | (w.bytes[p + 3]! << 8);
      const cnt = w.bytes[p + 4]! | (w.bytes[p + 5]! << 8) | (w.bytes[p + 6]! << 16) | (w.bytes[p + 7]! << 24);
      const size = (type === 2 ? 1 : type === 5 ? 8 : 4) * cnt;
      if (size > 4) {
        const rel = w.bytes[p + 8]! | (w.bytes[p + 9]! << 8) | (w.bytes[p + 10]! << 16) | (w.bytes[p + 11]! << 24);
        const abs = w32(cursor + rel);
        w.bytes[p + 8] = abs[0]!;
        w.bytes[p + 9] = abs[1]!;
        w.bytes[p + 10] = abs[2]!;
        w.bytes[p + 11] = abs[3]!;
      }
    }
    gpsBytes = [...w.bytes, ...w.extras];
  }

  // patch IFD0 extra offsets (they are relative to start of IFD0)
  const count0 = ifd0w.bytes[0]! | (ifd0w.bytes[1]! << 8);
  for (let i = 0; i < count0; i++) {
    const p = 2 + i * 12;
    const tag = ifd0w.bytes[p]! | (ifd0w.bytes[p + 1]! << 8);
    if (tag === 0x8769 || tag === 0x8825) continue;
    const type = ifd0w.bytes[p + 2]! | (ifd0w.bytes[p + 3]! << 8);
    const cnt = ifd0w.bytes[p + 4]! | (ifd0w.bytes[p + 5]! << 8) | (ifd0w.bytes[p + 6]! << 16) | (ifd0w.bytes[p + 7]! << 24);
    const size = (type === 2 ? 1 : 4) * cnt;
    if (size > 4) {
      const rel = ifd0w.bytes[p + 8]! | (ifd0w.bytes[p + 9]! << 8) | (ifd0w.bytes[p + 10]! << 16) | (ifd0w.bytes[p + 11]! << 24);
      const abs = w32(base0 + rel);
      ifd0w.bytes[p + 8] = abs[0]!;
      ifd0w.bytes[p + 9] = abs[1]!;
      ifd0w.bytes[p + 10] = abs[2]!;
      ifd0w.bytes[p + 11] = abs[3]!;
    }
  }

  const all = [...header, ...ifd0w.bytes, ...ifd0w.extras, ...exifBytes, ...gpsBytes];
  return Uint8Array.from(all);
}

export function buildXmp(fields: ExifWriteFields): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const parts = [
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:exif="http://ns.adobe.com/exif/1.0/">',
  ];
  if (fields.description) parts.push(`<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${esc(fields.description)}</rdf:li></rdf:Alt></dc:description>`);
  if (fields.artist) parts.push(`<dc:creator><rdf:Seq><rdf:li>${esc(fields.artist)}</rdf:li></rdf:Seq></dc:creator>`);
  if (fields.copyright) parts.push(`<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${esc(fields.copyright)}</rdf:li></rdf:Alt></dc:rights>`);
  if (fields.datetimeOriginal) parts.push(`<xmp:CreateDate>${esc(fields.datetimeOriginal)}</xmp:CreateDate>`);
  parts.push('</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>');
  return parts.join('');
}

/** Minimal IPTC IIM: record 2, datasets 80 (byline), 120 (caption), 116 (copyright). */
export function buildIptc(fields: ExifWriteFields): Uint8Array {
  const chunks: number[] = [];
  const ds = (id: number, text: string) => {
    const b = new TextEncoder().encode(text);
    chunks.push(0x1c, 2, id, (b.length >> 8) & 0xff, b.length & 0xff, ...b);
  };
  if (fields.artist) ds(80, fields.artist);
  if (fields.copyright) ds(116, fields.copyright);
  if (fields.description) ds(120, fields.description);
  return Uint8Array.from(chunks);
}

export function shiftExifDate(datetime: string, offsetHours: number): string {
  const m = datetime.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return datetime;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
  d.setUTCHours(d.getUTCHours() + offsetHours);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}:${p(d.getUTCMonth() + 1)}:${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export function formatOffset(hours: number): string {
  const sign = hours >= 0 ? '+' : '-';
  const ah = Math.abs(hours);
  const h = Math.floor(ah);
  const m = Math.round((ah - h) * 60);
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseExistingExif(bytes?: Uint8Array): TiffParse | undefined {
  if (!bytes) return undefined;
  if (bytes[0] === 0xff && bytes[1] === 0xe1) {
    const payload = bytes.subarray(4);
    const tiffOff = payload[4] === 0 && payload[5] === 0 ? 6 : 4;
    return parseTiff(payload.subarray(tiffOff));
  }
  return parseTiff(bytes);
}
