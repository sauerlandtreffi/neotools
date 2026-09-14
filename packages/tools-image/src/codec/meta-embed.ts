import { parseJpeg, injectJpegSegment, latin1, readU16BE, writeU16BE, writeU32LE, fourcc } from '@neotools/parsers';
import { encodePngRgba, makeIccpChunk, makeItxtChunk, pngExif, pngIcc } from './png.js';
import type { ImageMeta } from './types.js';

const SRGB_ICC = (() => {
  // Minimal sRGB CMM-type tag: we only *tag* files; true conversion needs canvas/jsquash colorSpace.
  return undefined as Uint8Array | undefined;
})();

export function extractJpegMeta(bytes: Uint8Array): Pick<ImageMeta, 'exif' | 'icc' | 'xmp' | 'iptc' | 'orientation' | 'iccTagged'> {
  const jpeg = parseJpeg(bytes);
  const orientation = typeof jpeg?.exif?.ifds[0]?.tags.find((t) => t.tag === 0x0112)?.value === 'number'
    ? (jpeg.exif.ifds[0]!.tags.find((t) => t.tag === 0x0112)!.value as number)
    : 1;
  let icc: Uint8Array | undefined;
  let exif: Uint8Array | undefined;
  let iptc: Uint8Array | undefined;
  if (jpeg) {
    const parts: Uint8Array[] = [];
    for (const seg of jpeg.segments) {
      if (seg.note === 'ICC') {
        const payload = bytes.subarray(seg.offset + 4, seg.offset + seg.length);
        // skip "ICC_PROFILE\0" + seq
        if (payload.length > 14) parts.push(payload.subarray(14));
      }
      if (seg.note === 'Exif') {
        exif = bytes.subarray(seg.offset, seg.offset + seg.length);
      }
      if (seg.marker === 0xed) {
        iptc = bytes.subarray(seg.offset, seg.offset + seg.length);
      }
    }
    if (parts.length) {
      let n = 0;
      for (const p of parts) n += p.length;
      icc = new Uint8Array(n);
      let o = 0;
      for (const p of parts) {
        icc.set(p, o);
        o += p.length;
      }
    }
  }
  return {
    exif,
    icc,
    xmp: jpeg?.xmp,
    iptc,
    orientation: orientation || 1,
    iccTagged: Boolean(icc),
  };
}

export function stripJpegSegments(bytes: Uint8Array, drop: Set<string>): Uint8Array {
  const jpeg = parseJpeg(bytes);
  if (!jpeg) return bytes;
  const keep: Uint8Array[] = [bytes.subarray(0, 2)];
  for (const seg of jpeg.segments) {
    if (seg.name === 'SOI') continue;
    const note = seg.note ?? '';
    if (drop.has(note) || (drop.has('COM') && seg.marker === 0xfe)) continue;
    if (drop.has('Exif') && seg.note === 'Exif') continue;
    if (drop.has('XMP') && seg.note === 'XMP') continue;
    if (drop.has('ICC') && seg.note === 'ICC') continue;
    if (drop.has('IPTC') && seg.marker === 0xed) continue;
    keep.push(bytes.subarray(seg.offset, seg.offset + seg.length));
  }
  const restStart = jpeg.eoiOffset >= 0 ? jpeg.eoiOffset : bytes.length;
  // SOS payload is already included via segments walk for markers; after last non-SOS we need scan data.
  // Safer: rebuild from segments in order, then remaining from last segment end.
  const last = jpeg.segments[jpeg.segments.length - 1];
  if (last && last.name !== 'EOI' && restStart > last.offset + last.length) {
    keep.push(bytes.subarray(last.offset + last.length));
  } else if (jpeg.eoiOffset >= 0) {
    keep.push(bytes.subarray(jpeg.eoiOffset));
  }
  let n = 0;
  for (const p of keep) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of keep) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function jpegApp1Exif(tiffOrApp1: Uint8Array): Uint8Array {
  if (tiffOrApp1[0] === 0xff && tiffOrApp1[1] === 0xe1) return tiffOrApp1;
  const payload = new Uint8Array(6 + tiffOrApp1.length);
  payload.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
  payload.set(tiffOrApp1, 6);
  const seg = new Uint8Array(4 + payload.length);
  seg[0] = 0xff;
  seg[1] = 0xe1;
  const len = payload.length + 2;
  writeU16BE(seg, 2, len);
  seg.set(payload, 4);
  return seg;
}

export function jpegApp1Xmp(xml: string): Uint8Array {
  const prefix = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0');
  const body = new TextEncoder().encode(xml);
  const payload = new Uint8Array(prefix.length + body.length);
  payload.set(prefix, 0);
  payload.set(body, prefix.length);
  const seg = new Uint8Array(4 + payload.length);
  seg[0] = 0xff;
  seg[1] = 0xe1;
  writeU16BE(seg, 2, payload.length + 2);
  seg.set(payload, 4);
  return seg;
}

export function jpegApp2Icc(profile: Uint8Array): Uint8Array[] {
  const header = new TextEncoder().encode('ICC_PROFILE\0');
  const max = 65533 - header.length - 2;
  const chunks: Uint8Array[] = [];
  const count = Math.max(1, Math.ceil(profile.length / max));
  for (let i = 0; i < count; i++) {
    const slice = profile.subarray(i * max, Math.min(profile.length, (i + 1) * max));
    const payload = new Uint8Array(header.length + 2 + slice.length);
    payload.set(header, 0);
    payload[header.length] = i + 1;
    payload[header.length + 1] = count;
    payload.set(slice, header.length + 2);
    const seg = new Uint8Array(4 + payload.length);
    seg[0] = 0xff;
    seg[1] = 0xe2;
    writeU16BE(seg, 2, payload.length + 2);
    seg.set(payload, 4);
    chunks.push(seg);
  }
  return chunks;
}

export function embedJpegMeta(
  jpeg: Uint8Array,
  opts: { exif?: Uint8Array; xmp?: string; icc?: Uint8Array; strip?: boolean },
): Uint8Array {
  let out = stripJpegSegments(jpeg, new Set(opts.strip ? ['Exif', 'XMP', 'ICC', 'IPTC'] : []));
  if (opts.icc) {
    for (const seg of jpegApp2Icc(opts.icc).reverse()) out = injectJpegSegment(out, seg);
  }
  if (opts.xmp) out = injectJpegSegment(out, jpegApp1Xmp(opts.xmp));
  if (opts.exif) out = injectJpegSegment(out, jpegApp1Exif(opts.exif));
  return out;
}

export function embedPngMeta(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: { exif?: Uint8Array; xmp?: string; icc?: Uint8Array },
): Uint8Array {
  const extras: Array<{ type: string; data: Uint8Array }> = [];
  if (opts.icc) extras.push({ type: 'iCCP', data: makeIccpChunk(opts.icc) });
  if (opts.exif) extras.push({ type: 'eXIf', data: opts.exif[0] === 0xff ? opts.exif.subarray(10) : opts.exif });
  if (opts.xmp) extras.push({ type: 'iTXt', data: makeItxtChunk('XML:com.adobe.xmp', opts.xmp) });
  return encodePngRgba(data, width, height, extras);
}

function riffChunks(bytes: Uint8Array): Array<{ fourcc: string; offset: number; size: number; data: Uint8Array }> {
  if (latin1(bytes, 0, 4) !== 'RIFF' || latin1(bytes, 8, 4) !== 'WEBP') return [];
  const out: Array<{ fourcc: string; offset: number; size: number; data: Uint8Array }> = [];
  let i = 12;
  while (i + 8 <= bytes.length) {
    const id = fourcc(bytes, i);
    const size = bytes[i + 4]! | (bytes[i + 5]! << 8) | (bytes[i + 6]! << 16) | (bytes[i + 7]! << 24);
    const data = bytes.subarray(i + 8, Math.min(bytes.length, i + 8 + size));
    out.push({ fourcc: id, offset: i, size, data });
    i += 8 + size + (size & 1);
  }
  return out;
}

export function extractWebpMeta(bytes: Uint8Array): { exif?: Uint8Array; icc?: Uint8Array; xmp?: string } {
  const chunks = riffChunks(bytes);
  let exif: Uint8Array | undefined;
  let icc: Uint8Array | undefined;
  let xmp: string | undefined;
  for (const c of chunks) {
    if (c.fourcc === 'EXIF') exif = c.data.slice();
    if (c.fourcc === 'ICCP') icc = c.data.slice();
    if (c.fourcc === 'XMP ') xmp = new TextDecoder().decode(c.data);
  }
  return { exif, icc, xmp };
}

function webpChunk(id: string, data: Uint8Array): Uint8Array {
  const pad = data.length & 1 ? 1 : 0;
  const out = new Uint8Array(8 + data.length + pad);
  out.set(new TextEncoder().encode(id), 0);
  writeU32LE(out, 4, data.length);
  out.set(data, 8);
  return out;
}

export function embedWebpMeta(
  webp: Uint8Array,
  opts: { exif?: Uint8Array; icc?: Uint8Array; xmp?: string; strip?: boolean },
): Uint8Array {
  const chunks = riffChunks(webp);
  if (!chunks.length) return webp;
  const keep = chunks.filter((c) => {
    if (!opts.strip && !opts.exif && !opts.icc && !opts.xmp) return true;
    if (c.fourcc === 'EXIF' || c.fourcc === 'ICCP' || c.fourcc === 'XMP ') return false;
    return true;
  });
  const extras: Uint8Array[] = [];
  if (opts.icc) extras.push(webpChunk('ICCP', opts.icc));
  if (opts.exif) extras.push(webpChunk('EXIF', opts.exif[0] === 0xff ? opts.exif.subarray(10) : opts.exif));
  if (opts.xmp) extras.push(webpChunk('XMP ', new TextEncoder().encode(opts.xmp)));
  const parts = keep.map((c) => webp.subarray(c.offset, c.offset + 8 + c.size + (c.size & 1)));
  let inner = 4;
  for (const p of parts) inner += p.length;
  for (const p of extras) inner += p.length;
  const out = new Uint8Array(8 + inner);
  out.set(new TextEncoder().encode('RIFF'), 0);
  writeU32LE(out, 4, inner);
  out.set(new TextEncoder().encode('WEBP'), 8);
  let o = 12;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  for (const p of extras) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function readPngSidecar(bytes: Uint8Array): { exif?: Uint8Array; icc?: Uint8Array } {
  return { exif: pngExif(bytes), icc: pngIcc(bytes) };
}

void readU16BE;
void SRGB_ICC;
