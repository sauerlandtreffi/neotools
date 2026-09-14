import { deflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { MIME, neoFileFromBytes } from '@neotools/engine';
import type { NeoFile } from '@neotools/engine';

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i]!;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

function chunk(type: string, data: Buffer): Buffer {
  const t = Buffer.from(type);
  const crc = crc32(Buffer.concat([t, data]));
  return Buffer.concat([u32(data.length), t, data, u32(crc)]);
}

/** Uncompressed-ish RGB PNG with a noisy gradient (compresses well as JPEG). */
export function makeRgbPng(width: number, height: number): Uint8Array {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[(width * 3 + 1) * y] = 0;
    for (let x = 0; x < width; x++) {
      const o = (width * 3 + 1) * y + 1 + x * 3;
      raw[o] = (x * 17 + y * 3) & 255;
      raw[o + 1] = (x * 5 + y * 11) & 255;
      raw[o + 2] = (x * 13 + y * 19) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return new Uint8Array(png);
}

export async function makePdfWithImage(opts?: {
  name?: string;
  text?: string;
  width?: number;
  height?: number;
}): Promise<NeoFile> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const png = await doc.embedPng(makeRgbPng(opts?.width ?? 320, opts?.height ?? 240));
  const page = doc.addPage([420, 560]);
  page.drawImage(png, { x: 20, y: 80, width: 380, height: 400 });
  page.drawText(opts?.text ?? 'KeepThisText', {
    x: 40,
    y: 40,
    size: 16,
    font,
    color: rgb(0, 0, 0),
  });
  const bytes = await doc.save();
  return neoFileFromBytes(opts?.name ?? 'img.pdf', bytes, MIME.pdf);
}
