import { mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { EXIT_OK, runCli } from '../src/cli.js';

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
  return Buffer.concat([u32(data.length), t, data, u32(crc32(Buffer.concat([t, data])))]);
}

function noisyPng(width: number, height: number): Uint8Array {
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
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 1 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

async function writeTextPdf(dir: string, name: string, text: string): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 200]);
  page.drawText(text, { x: 40, y: 100, size: 16, font });
  const path = join(dir, name);
  await writeFile(path, await doc.save());
  return path;
}

async function writeImagePdf(dir: string, name: string): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const png = await doc.embedPng(noisyPng(400, 300));
  const page = doc.addPage([420, 560]);
  page.drawImage(png, { x: 20, y: 80, width: 380, height: 400 });
  page.drawText('KeepThisText', { x: 40, y: 40, size: 16, font, color: rgb(0, 0, 0) });
  const path = join(dir, name);
  await writeFile(path, await doc.save());
  return path;
}

describe('CLI pdf-lock + pdf-compress e2e', () => {
  it(
    'encrypts then decrypts a roundtrip',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'neotools-lock-'));
      const src = await writeTextPdf(dir, 'plain.pdf', 'LockSecret');
      const lockedDir = join(dir, 'locked');
      const unlockedDir = join(dir, 'unlocked');
      const encrypt = await runCli(
        [
          'run',
          'pdf-lock',
          src,
          '-o',
          lockedDir,
          '--mode',
          'encrypt',
          '--user-password',
          'user-pw',
          '--owner-password',
          'owner-pw',
        ],
        { stdout: () => undefined, stderr: () => undefined },
      );
      expect(encrypt).toBe(EXIT_OK);
      const lockedName = (await readdir(lockedDir)).find((n) => n.endsWith('.pdf'));
      expect(lockedName).toBeTruthy();
      const lockedPath = join(lockedDir, lockedName!);
      await expect(PDFDocument.load(await readFile(lockedPath))).rejects.toThrow(/encrypted/i);

      const decrypt = await runCli(
        ['run', 'pdf-lock', lockedPath, '-o', unlockedDir, '--mode', 'decrypt', '--password', 'user-pw'],
        { stdout: () => undefined, stderr: () => undefined },
      );
      expect(decrypt).toBe(EXIT_OK);
      const unlockedName = (await readdir(unlockedDir)).find((n) => n.endsWith('.pdf'));
      const opened = await PDFDocument.load(await readFile(join(unlockedDir, unlockedName!)));
      expect(opened.getPageCount()).toBe(1);
    },
    90_000,
  );

  it(
    'compresses an embedded-image PDF',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'neotools-cmp-'));
      const src = await writeImagePdf(dir, 'photo.pdf');
      const before = (await readFile(src)).byteLength;
      const out = join(dir, 'out');
      const code = await runCli(['run', 'pdf-compress', src, '-o', out, '--preset', 'heavy'], {
        stdout: () => undefined,
        stderr: () => undefined,
      });
      expect(code).toBe(EXIT_OK);
      const pdfName = (await readdir(out)).find((n) => n.endsWith('.pdf'));
      expect(pdfName).toBeTruthy();
      const after = (await readFile(join(out, pdfName!))).byteLength;
      expect(after).toBeLessThanOrEqual(before);
      const doc = await PDFDocument.load(await readFile(join(out, pdfName!)));
      expect(doc.getPageCount()).toBe(1);
    },
    90_000,
  );
});
