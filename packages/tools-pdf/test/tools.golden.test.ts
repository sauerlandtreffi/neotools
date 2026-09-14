import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { MIME, neoFileFromBytes } from '@neotools/engine';
import { pdfMerge } from '../src/tools/pdf-merge.js';
import { pdfSplit } from '../src/tools/pdf-split.js';
import { pdfRotate } from '../src/tools/pdf-rotate.js';
import { pdfReorder } from '../src/tools/pdf-reorder.js';
import { pdfWatermark } from '../src/tools/pdf-watermark.js';
import { pdfPageNumbers } from '../src/tools/pdf-page-numbers.js';
import { pdfMetadata } from '../src/tools/pdf-metadata.js';
import { pdfToImages } from '../src/tools/pdf-to-images.js';
import { imagesToPdf } from '../src/tools/images-to-pdf.js';
import { pdfExtractText } from '../src/tools/pdf-extract-text.js';
import { pdfSanitize } from '../src/tools/pdf-sanitize.js';
import { inspectPdf } from '../src/inspect.js';
import { ctx, makePdf, pageCount, tinyJpg, tinyPng } from './helpers.js';

describe('pdf-merge', () => {
  it('merges two generated PDFs and keeps bookmarks optional', async () => {
    const a = await makePdf({ name: 'a.pdf', pages: 1, text: 'AAA' });
    const b = await makePdf({ name: 'b.pdf', pages: 2, text: 'BBB' });
    const result = await pdfMerge.run(ctx(), [a, b], { bookmarkPerFile: true, outputName: 'out.pdf' });
    expect(result.outputs).toHaveLength(1);
    expect(await pageCount(result.outputs[0]!)).toBe(3);
    const doc = await PDFDocument.load(await result.outputs[0]!.bytes());
    expect(doc.catalog.has((await import('pdf-lib')).PDFName.of('Outlines'))).toBe(true);
    expect(result.report?.batch).toEqual([
      { file: 'a.pdf', status: 'ok' },
      { file: 'b.pdf', status: 'ok' },
    ]);
  });

  it('skips a corrupt file and still merges the rest', async () => {
    const a = await makePdf({ name: 'good.pdf', pages: 1 });
    const bad = neoFileFromBytes('bad.pdf', new TextEncoder().encode('not-a-pdf'), MIME.pdf);
    const result = await pdfMerge.run(ctx(), [a, bad], { bookmarkPerFile: false, outputName: 'out.pdf' });
    expect(await pageCount(result.outputs[0]!)).toBe(1);
    expect(result.report?.batch).toEqual([
      { file: 'good.pdf', status: 'ok' },
      { file: 'bad.pdf', status: 'error', reason: expect.any(String) },
    ]);
  });
});

describe('pdf-split', () => {
  it('splits each page', async () => {
    const src = await makePdf({ name: 's.pdf', pages: 3 });
    const result = await pdfSplit.run(ctx(), [src], { mode: 'each-page', ranges: '', everyN: 2 });
    expect(result.outputs).toHaveLength(3);
    expect(await pageCount(result.outputs[0]!)).toBe(1);
  });

  it('splits ranges 1-2,3', async () => {
    const src = await makePdf({ name: 's.pdf', pages: 3 });
    const result = await pdfSplit.run(ctx(), [src], { mode: 'ranges', ranges: '1-2,3', everyN: 2 });
    expect(result.outputs).toHaveLength(2);
    expect(await pageCount(result.outputs[0]!)).toBe(2);
    expect(await pageCount(result.outputs[1]!)).toBe(1);
  });

  it('splits every N pages', async () => {
    const src = await makePdf({ name: 's.pdf', pages: 5 });
    const result = await pdfSplit.run(ctx(), [src], { mode: 'every-n', ranges: '', everyN: 2 });
    expect(result.outputs).toHaveLength(3);
    expect(await pageCount(result.outputs[2]!)).toBe(1);
  });
});

describe('pdf-rotate', () => {
  it('rotates selected pages by 90', async () => {
    const src = await makePdf({ name: 'r.pdf', pages: 2 });
    const result = await pdfRotate.run(ctx(), [src], { angle: 90, pages: '1' });
    const doc = await PDFDocument.load(await result.outputs[0]!.bytes());
    expect(doc.getPage(0).getRotation().angle).toBe(90);
    expect(doc.getPage(1).getRotation().angle).toBe(0);
  });
});

describe('pdf-reorder', () => {
  it('reorders and deletes pages', async () => {
    const src = await makePdf({ name: 'o.pdf', pages: 3, text: 'ORD' });
    const result = await pdfReorder.run(ctx(), [src], { order: [3, 1], delete: [2] });
    expect(await pageCount(result.outputs[0]!)).toBe(2);
  });
});

describe('pdf-watermark', () => {
  it('draws text and still yields a valid PDF', async () => {
    const src = await makePdf({ name: 'w.pdf', pages: 1 });
    const before = (await src.bytes()).byteLength;
    const result = await pdfWatermark.run(ctx(), [src], {
      text: 'SECRET',
      opacity: 0.4,
      rotation: -20,
      position: 'center',
      fontSize: 40,
    });
    expect(await pageCount(result.outputs[0]!)).toBe(1);
    expect((await result.outputs[0]!.bytes()).byteLength).toBeGreaterThan(before);
  });
});

describe('pdf-page-numbers', () => {
  it('adds formatted numbers', async () => {
    const src = await makePdf({ name: 'n.pdf', pages: 2 });
    const result = await pdfPageNumbers.run(
      ctx(),
      [src],
      { position: 'footer-center', format: 'Seite {n} von {total}', start: 1, fontSize: 10 },
    );
    expect(await pageCount(result.outputs[0]!)).toBe(2);
    const extracted = await pdfExtractText.run(ctx(), result.outputs, { pageBreaks: false });
    const text = new TextDecoder().decode(await extracted.outputs[0]!.bytes());
    expect(text).toMatch(/Seite 1 von 2|Seite/);
  });
});

describe('pdf-metadata', () => {
  it('reads, sets and clears info + xmp flag', async () => {
    const src = await makePdf({ name: 'm.pdf', pages: 1, title: 'Alt', author: 'Ada' });
    const read = await pdfMetadata.run(ctx(), [src], { mode: 'read', stripXmp: true });
    expect(read.outputs[0]!.mime).toBe(MIME.json);
    const json = JSON.parse(new TextDecoder().decode(await read.outputs[0]!.bytes()));
    expect(json.title).toBe('Alt');

    const set = await pdfMetadata.run(ctx(), [src], {
      mode: 'set',
      stripXmp: true,
      title: 'Neu',
      author: 'Bea',
      subject: 'Thema',
      keywords: 'a, b',
      creator: 'Neo',
      producer: 'NeoTools',
    });
    const afterSet = await PDFDocument.load(await set.outputs[0]!.bytes());
    expect(afterSet.getTitle()).toBe('Neu');
    expect(afterSet.getAuthor()).toBe('Bea');

    const cleared = await pdfMetadata.run(ctx(), [src], { mode: 'clear', stripXmp: true });
    const afterClear = await PDFDocument.load(await cleared.outputs[0]!.bytes());
    expect(afterClear.getTitle() ?? '').toBe('');
  });
});

describe('images-to-pdf', () => {
  it('embeds PNG and JPEG onto A4', async () => {
    const png = neoFileFromBytes('a.png', await tinyPng(), MIME.png);
    const jpg = neoFileFromBytes('b.jpg', await tinyJpg(), MIME.jpeg);
    const result = await imagesToPdf.run(ctx(), [png, jpg], {
      pageSize: 'a4',
      margin: 20,
      outputName: 'pics.pdf',
    });
    expect(await pageCount(result.outputs[0]!)).toBe(2);
  });
});

describe('pdf-extract-text', () => {
  it('extracts programmed text with page breaks', async () => {
    const src = await makePdf({ name: 't.pdf', pages: 2, text: 'HelloNeo' });
    const result = await pdfExtractText.run(ctx(), [src], { pageBreaks: true });
    const text = new TextDecoder().decode(await result.outputs[0]!.bytes());
    expect(text).toContain('HelloNeo');
    expect(text).toContain('Seite 1');
    expect(text).toContain('Seite 2');
  });
});

describe('pdf-sanitize', () => {
  it('removes OpenAction/JS and reports verification', async () => {
    const src = await makePdf({
      name: 'dirty.pdf',
      pages: 1,
      title: 'Secret',
      author: 'Hidden',
      withOpenAction: true,
    });
    const beforeDoc = await PDFDocument.load(await src.bytes());
    expect(inspectPdf(beforeDoc).hasOpenAction).toBe(true);

    const result = await pdfSanitize.run(ctx(), [src], { removeAnnotations: true, flattenForms: true });
    const pdfOut = result.outputs.find((f) => f.mime === MIME.pdf)!;
    const afterDoc = await PDFDocument.load(await pdfOut.bytes());
    const after = inspectPdf(afterDoc);
    expect(after.hasOpenAction).toBe(false);
    expect(after.hasJavaScript).toBe(false);
    expect(after.hasInfo).toBe(false);
    const report = result.report as { files: Array<{ verification: { found: string[]; removed: string[] } }> };
    expect(report.files[0]!.verification.found).toEqual(expect.arrayContaining(['hasOpenAction']));
    expect(report.files[0]!.verification.removed).toEqual(expect.arrayContaining(['hasOpenAction']));
  });
});

describe('pdf-to-images', () => {
  it('renders PNG or explains missing canvas backend', async () => {
    const src = await makePdf({ name: 'img.pdf', pages: 1, text: 'RenderMe' });
    const result = await pdfToImages.run(ctx(), [src], { format: 'png', dpi: 72, quality: 0.9 });
    const batch = result.report?.batch as Array<{ status: string; reason?: string }>;
    if (result.outputs.length) {
      const bytes = await result.outputs[0]!.bytes();
      expect(bytes[0]).toBe(0x89);
      expect(bytes[1]).toBe(0x50);
    } else {
      expect(batch[0]?.status).toBe('error');
      expect(batch[0]?.reason).toMatch(/Browser|canvas|OffscreenCanvas|napi/i);
    }
  });
});
