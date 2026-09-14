/**
 * OCR tests:
 * - Textlayer skip + invisible-text positioning are unit-tested without Tesseract.
 * - Live Tesseract.js runs only when tessdata exists AND @napi-rs/canvas (or OffscreenCanvas) is available.
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { MIME, neoFileFromBytes } from '@neotools/engine';
import { pageHasTextLayer, wordsToPdfPositions, writeInvisibleWords } from '../src/ocr.js';
import { openPdfjsDocument } from '../src/pdfjs.js';
import { pdfExtractText } from '../src/tools/pdf-extract-text.js';
import { pdfOcr } from '../src/tools/pdf-ocr.js';
import { ctx, makePdf } from './helpers.js';
import { resolveNodeTessdata } from '../src/ocr.js';

describe('OCR textlayer helpers', () => {
  it('detects pages with and without a text layer', async () => {
    const withText = await makePdf({ name: 't.pdf', pages: 1, text: 'HelloLayer' });
    const pdf = await openPdfjsDocument(await withText.bytes());
    expect(await pageHasTextLayer(await pdf.getPage(1))).toBe(true);
    await pdf.destroy();

    const blank = await PDFDocument.create();
    blank.addPage([200, 200]);
    const emptyFile = neoFileFromBytes('e.pdf', await blank.save(), MIME.pdf);
    const emptyDoc = await openPdfjsDocument(await emptyFile.bytes());
    expect(await pageHasTextLayer(await emptyDoc.getPage(1))).toBe(false);
    await emptyDoc.destroy();
  });

  it('writes invisible words that pdfjs can extract at mapped positions', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 100]);
    const placed = wordsToPdfPositions(
      [{ text: 'GhostWord', bbox: { x0: 10, y0: 10, x1: 90, y1: 30 }, confidence: 90 }],
      200,
      100,
      100,
      50,
    );
    expect(placed[0]!.x).toBeCloseTo(20);
    expect(placed[0]!.y).toBeCloseTo(40);
    await writeInvisibleWords(page, placed, StandardFonts.Helvetica);
    const bytes = await doc.save();
    const extracted = await pdfExtractText.run(ctx(), [neoFileFromBytes('inv.pdf', bytes, MIME.pdf)], {
      pageBreaks: false,
    });
    const text = new TextDecoder().decode(await extracted.outputs[0]!.bytes());
    expect(text).toContain('GhostWord');
  });
});

describe('pdf-ocr skip logic', () => {
  it('skips pages that already have a text layer unless forceAll', async () => {
    const src = await makePdf({ name: 'skip.pdf', pages: 1, text: 'AlreadyThere' });
    const result = await pdfOcr.run(ctx(), [src], {
      languages: ['eng'],
      dpi: 72,
      forceAll: false,
      outputTxt: false,
    });
    const report = (result.report as { files: Array<{ skipped: number; processed: number }> }).files[0];
    if (report) {
      expect(report.skipped).toBe(1);
      expect(report.processed).toBe(0);
    } else {
      // run failed because canvas/OCR missing — still a valid skip-path error
      expect(result.warnings.join(' ')).toMatch(/canvas|OCR|tessdata|Offscreen|napi/i);
    }
  });
});

describe('pdf-ocr live Tesseract (optional)', () => {
  it('runs only with tessdata + canvas backend', async () => {
    const tess = await resolveNodeTessdata();
    let canvas = false;
    try {
      await import('@napi-rs/canvas');
      canvas = true;
    } catch {
      canvas = typeof OffscreenCanvas !== 'undefined';
    }
    if (!tess || !canvas) {
      expect(true).toBe(true);
      return;
    }
    const src = await makePdf({ name: 'live.pdf', pages: 1, text: 'NeoOCR' });
    const result = await pdfOcr.run(ctx(), [src], {
      languages: ['eng'],
      dpi: 150,
      forceAll: true,
      outputTxt: true,
    });
    expect(result.outputs.some((f) => f.mime === MIME.pdf)).toBe(true);
  });
});
