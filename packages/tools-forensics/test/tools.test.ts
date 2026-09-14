import { describe, expect, it } from 'vitest';
import { createToolContext, MIME, neoFileFromBytes } from '@neotools/engine';
import { forensicsHash } from '../src/tools/forensics-hash.js';
import { forensicsBytesCompare } from '../src/tools/forensics-bytes-compare.js';
import { forensicsAutopsy } from '../src/tools/forensics-autopsy.js';
import { forensicsHiddenData } from '../src/tools/forensics-hidden-data.js';
import { forensicsShareSafe } from '../src/tools/forensics-share-safe.js';
import { forensicsFingerprint } from '../src/tools/forensics-fingerprint.js';
import { forensicsWatermarkFind } from '../src/tools/forensics-watermark-find.js';
import { forensicsProvenance } from '../src/tools/forensics-provenance.js';
import { createForensicsRegistry } from '../src/index.js';
import { hashBytes } from '../src/util/hashes.js';
import {
  buildId3Mp3,
  buildMinimalMp4,
  buildMinimalWav,
  dirtyPdf,
  fileOf,
  hiddenTextPdf,
  jpegWithExif,
  jpegWithZip,
  minimalDocx,
  pngAfterIend,
  tinyJpg,
  tinyPng,
} from './fixtures.js';

const ctx = () => createToolContext();

function jsonOf(result: { outputs: Array<{ name: string; bytes: () => Promise<Uint8Array> }> }) {
  const f = result.outputs.find((o) => o.name.endsWith('.json'));
  return f!.bytes().then((b) => JSON.parse(new TextDecoder().decode(b)));
}

describe('forensics-hash', () => {
  it('hashes and verifies a SHA256SUMS manifest', async () => {
    const data = tinyPng();
    const sha = hashBytes('sha256', data);
    const file = fileOf('x.png', data, MIME.png);
    const hashed = await forensicsHash.run(ctx(), [file], {
      locale: 'de',
      mode: 'hash',
      algorithms: ['sha256', 'sha512', 'blake3'],
    });
    const sums = hashed.outputs.find((o) => o.name === 'SHA256SUMS')!;
    const text = new TextDecoder().decode(await sums.bytes());
    expect(text).toContain(sha);
    expect(text).toContain('x.png');

    const man = neoFileFromBytes('SHA256SUMS', new TextEncoder().encode(`${sha}  x.png\n`), 'text/plain');
    const ok = await forensicsHash.run(ctx(), [file, man], {
      locale: 'en',
      mode: 'verify',
      algorithms: ['sha256'],
    });
    const payload = await jsonOf(ok);
    expect(payload.verify[0].status).toBe('ok');

    const bad = neoFileFromBytes('SHA256SUMS', new TextEncoder().encode(`${'0'.repeat(64)}  x.png\n`), 'text/plain');
    const fail = await forensicsHash.run(ctx(), [file, bad], {
      locale: 'en',
      mode: 'verify',
      algorithms: ['sha256'],
    });
    expect((await jsonOf(fail)).verify[0].status).toBe('mismatch');
  });
});

describe('forensics-bytes-compare', () => {
  it('reports identical and first difference', async () => {
    const a = fileOf('a.bin', new Uint8Array([1, 2, 3, 4]), 'application/octet-stream');
    const same = await forensicsBytesCompare.run(ctx(), [a, a], { locale: 'de', maxOffsets: 8, blockSize: 4096 });
    expect((await jsonOf(same)).identical).toBe(true);

    const b = fileOf('b.bin', new Uint8Array([1, 2, 9, 4, 5]), 'application/octet-stream');
    const diff = await forensicsBytesCompare.run(ctx(), [a, b], { locale: 'en', maxOffsets: 8, blockSize: 4096 });
    const r = await jsonOf(diff);
    expect(r.identical).toBe(false);
    expect(r.firstDiff).toBe(2);
    expect(r.lengthDiff).toBe(-1);
    expect(r.differingBlocks).toBeGreaterThanOrEqual(1);
  });
});

describe('forensics-autopsy', () => {
  it('parses jpeg/png/mp4/mp3/wav/zip trees', async () => {
    const files = [
      fileOf('a.jpg', tinyJpg(), MIME.jpeg),
      fileOf('a.png', tinyPng(), MIME.png),
      fileOf('a.mp4', buildMinimalMp4(), 'video/mp4'),
      fileOf('a.mp3', buildId3Mp3(), 'audio/mpeg'),
      fileOf('a.wav', buildMinimalWav(), 'audio/wav'),
      fileOf('d.docx', minimalDocx()),
    ];
    const result = await forensicsAutopsy.run(ctx(), files, { locale: 'de' });
    const payload = await jsonOf(result);
    const formats = payload.files.map((f: { format: string }) => f.format);
    expect(formats).toEqual(expect.arrayContaining(['jpeg', 'png', 'mp4', 'mp3', 'wav', 'docx']));
    const jpeg = payload.files.find((f: { format: string }) => f.format === 'jpeg');
    expect(jpeg.summary.scans).toBeGreaterThanOrEqual(1);
    const mp4 = payload.files.find((f: { format: string }) => f.format === 'mp4');
    expect(mp4.summary.brands.major).toBe('isom');
  });

  it('autopsies a dirty PDF with incremental EOF', async () => {
    const pdf = fileOf('dirty.pdf', await dirtyPdf(), MIME.pdf);
    const result = await forensicsAutopsy.run(ctx(), [pdf], { locale: 'en' });
    const row = (await jsonOf(result)).files[0];
    expect(row.format).toBe('pdf');
    expect(row.summary.raw.incrementalUpdates).toBeGreaterThanOrEqual(1);
    expect(row.summary.high.hasJavaScript || row.summary.raw.catalogHints.javascript).toBe(true);
  });
});

describe('forensics-hidden-data + share-safe', () => {
  it('flags jpeg+zip, png trailer, docx traces, hidden PDF text', async () => {
    const files = [
      fileOf('poly.jpg', jpegWithZip(), MIME.jpeg),
      fileOf('trail.png', pngAfterIend(), MIME.png),
      fileOf('gps.jpg', jpegWithExif(), MIME.jpeg),
      fileOf('memo.docx', minimalDocx()),
      fileOf('hid.pdf', hiddenTextPdf(), MIME.pdf),
    ];
    const hidden = await forensicsHiddenData.run(ctx(), files, { locale: 'de' });
    const rows = (await jsonOf(hidden)).files as Array<{ file: string; findings: Array<{ id: string }> }>;
    const ids = (name: string) => rows.find((r) => r.file === name)!.findings.map((f) => f.id);
    expect(ids('poly.jpg').some((id) => id.includes('jpeg-after') || id.includes('polyglot') || id.includes('zip'))).toBe(
      true,
    );
    expect(ids('trail.png')).toContain('png-after-iend');
    expect(ids('gps.jpg')).toContain('exif-gps');
    expect(ids('memo.docx')).toEqual(
      expect.arrayContaining(['office-author', 'office-track-changes', 'office-macros', 'office-comments']),
    );
    expect(ids('hid.pdf')).toContain('pdf-hidden-text');

    const share = await forensicsShareSafe.run(ctx(), [fileOf('poly.jpg', jpegWithZip(), MIME.jpeg)], { locale: 'en' });
    const s = (await jsonOf(share)).files[0];
    expect(s.light).toBe('red');
    expect(s.checklist.find((c: { id: string }) => c.id === 'polyglot').present).toBe(true);
  });
});

describe('fingerprint / watermark / provenance', () => {
  it('fingerprints with sha256 and skips pHash without canvas', async () => {
    const a = fileOf('a.png', tinyPng(), MIME.png);
    const result = await forensicsFingerprint.run(ctx(), [a], { locale: 'de', mode: 'create' });
    const fp = (await jsonOf(result)).fingerprints[0];
    expect(fp.sha256).toHaveLength(64);
    expect(fp.perceptual.skipped).toBe('no-canvas');

    const canvasCtx = createToolContext({
      platform: {
        id: 'node',
        capabilities: { canvas: true, opfs: false, workers: false, qpdf: false, ocr: false },
      },
    });
    const withCanvas = await forensicsFingerprint.run(canvasCtx, [a, a], { locale: 'en', mode: 'compare' });
    const cmp = (await jsonOf(withCanvas)).compare;
    expect(cmp.sha256Equal).toBe(true);
    expect(withCanvas.outputs[0]!.name.endsWith('.json')).toBe(true);
  });

  it('finds rotated watermark-like text on a generated PDF', async () => {
    const pdf = fileOf('w.pdf', await dirtyPdf(), MIME.pdf);
    const result = await forensicsWatermarkFind.run(ctx(), [pdf, fileOf('x.png', tinyPng(), MIME.png)], {
      locale: 'de',
    });
    const rows = (await jsonOf(result)).files as Array<{ file: string; findings: Array<{ kind: string }> }>;
    const pdfRow = rows.find((r) => r.file === 'w.pdf')!;
    expect(pdfRow.findings.length).toBeGreaterThan(0);
    const img = rows.find((r) => r.file === 'x.png')!;
    expect(img.findings[0]?.kind).toBe('image-unknown');
  });

  it('creates and verifies provenance', async () => {
    const file = fileOf('a.png', tinyPng(), MIME.png);
    const created = await forensicsProvenance.run(ctx(), [file], { locale: 'de', mode: 'create' });
    const man = created.outputs.find((o) => o.name === 'provenance.json')!;
    const verify = await forensicsProvenance.run(ctx(), [man, file], { locale: 'en', mode: 'verify' });
    expect((await jsonOf(verify)).verify.ok).toBe(true);
  });
});

describe('pack registry', () => {
  it('registers all 10 phase-1 tools', () => {
    const ids = createForensicsRegistry().ids();
    expect(ids).toEqual(
      expect.arrayContaining([
        'forensics-identify',
        'forensics-autopsy',
        'forensics-bytes-compare',
        'forensics-hash',
        'forensics-hidden-data',
        'forensics-fake-ext',
        'forensics-share-safe',
        'forensics-fingerprint',
        'forensics-watermark-find',
        'forensics-provenance',
      ]),
    );
    expect(ids).toHaveLength(10);
  });
});
