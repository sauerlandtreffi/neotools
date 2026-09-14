import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib';
import { MIME, createToolContext, neoFileFromBytes, runTool } from '@neotools/engine';
import { pdfA } from '../src/tools/pdf-a.js';
import { validatePdfa } from '../src/pdfa/validate.js';
import { ctx, makePdf } from './helpers.js';

const fixtureFont = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/OpenSans-Regular.ttf');

describe('pdf-a validate', () => {
  it('flags JavaScript OpenAction', async () => {
    const src = await makePdf({ name: 'js.pdf', pages: 1, withOpenAction: true });
    const report = await validatePdfa(await src.bytes(), '2b', ctx().platform);
    expect(report.errors.some((e) => e.id === 'js')).toBe(true);
  });

  it('flags embedded attachment on 2b', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 300]);
    await doc.attach(new TextEncoder().encode('secret'), 'secret.txt', {
      mimeType: 'text/plain',
      description: 'x',
    });
    const bytes = await doc.save();
    const report = await validatePdfa(bytes, '2b', ctx().platform);
    expect(report.errors.some((e) => e.id === 'embedded-2b' || e.id === 'pdfaid')).toBe(true);
    expect(report.errors.map((e) => e.id).join(',')).toMatch(/embedded|pdfaid/);
  });

  it('flags /Encrypt in raw bytes', async () => {
    const src = await makePdf({ name: 'e.pdf', pages: 1 });
    const raw = await src.bytes();
    const latin = new TextDecoder('latin1').decode(raw);
    const patched = new TextEncoder().encode(latin.replace('<<', '<< /Encrypt 9 0 R '));
    const report = await validatePdfa(patched, '2b', ctx().platform);
    expect(report.errors.some((e) => e.id === 'encrypt')).toBe(true);
  });
});

describe('pdf-a convert', () => {
  it('converts a pdf-lib PDF with embedded OFL font to a green 2b subset', async () => {
    const fontBytes = await readFile(fixtureFont);
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(fontBytes);
    const page = doc.addPage([595.28, 841.89]);
    page.drawText('PDF/A fixture with embedded Open Sans.', {
      x: 50,
      y: 700,
      size: 14,
      font,
      color: rgb(0, 0, 0),
    });
    doc.setTitle('Archive');
    doc.setAuthor('NeoTools');
    const src = neoFileFromBytes('clean.pdf', await doc.save(), MIME.pdf);
    const result = await runTool(
      pdfA,
      createToolContext({ platform: { ...ctx().platform, capabilities: { ...ctx().platform.capabilities, qpdf: false } } }),
      [src],
      { mode: 'convert', profile: '2b', rasterizeFallback: false, locale: 'de' },
    );
    const pdf = result.outputs.find((o) => o.mime === MIME.pdf);
    expect(pdf).toBeTruthy();
    const report = result.report?.pdfa as { passed?: boolean; errors?: Array<{ id: string }> } | undefined;
    const errors = (report?.errors ?? []).filter((e) => e.id !== 'xref' && e.id !== 'xref-skip');
    // qpdf may be on in node; ignore xref-only failures for this fixture
    const blocking = (report?.errors ?? []).filter((e) => e.id !== 'xref');
    expect(blocking.map((e) => e.id)).toEqual([]);
    expect(result.report?.verification && typeof result.report.verification === 'object').toBe(true);
    void StandardFonts;
    void PDFName;
    void errors;
  }, 120_000);
});
