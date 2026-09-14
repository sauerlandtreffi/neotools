import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { MIME, createToolContext, neoFileFromBytes, runTool } from '@neotools/engine';
import type { VerificationReport } from '@neotools/engine';
import { pdfRedact } from '../src/tools/pdf-redact.js';
import { generateSteuerId, isValidIban } from '../src/redact/patterns.js';
import { extractAllText } from '../src/redact/text-map.js';
import { verifyRedactedPdf } from '../src/redact/verify.js';
import { tokenizeContent, blankNeedlesInBytes } from '../src/redact/content-stream.js';

const IBAN = 'DE89370400440532013000';
const EMAIL = 'ada.lovelace@example.org';
const PLATE = 'M-AB 1234';

async function piiPdf() {
  const steuer = generateSteuerId();
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([500, 400]);
  page.drawText(`IBAN ${IBAN}`, { x: 40, y: 320, size: 14, font, color: rgb(0, 0, 0) });
  page.drawText(`IdNr ${steuer}`, { x: 40, y: 290, size: 14, font, color: rgb(0, 0, 0) });
  page.drawText(EMAIL, { x: 40, y: 260, size: 14, font, color: rgb(0, 0, 0) });
  page.drawText(`Kennzeichen ${PLATE}`, { x: 40, y: 230, size: 14, font, color: rgb(0, 0, 0) });
  const bytes = await doc.save();
  return {
    file: neoFileFromBytes('pii.pdf', bytes, MIME.pdf),
    steuer,
    bytes,
  };
}

describe('content-stream tokenizer', () => {
  it('blanks hex-encoded needles', () => {
    const hex = Buffer.from(IBAN, 'latin1').toString('hex');
    const src = `BT /F1 12 Tf 1 0 0 1 40 200 Tm <${hex}> Tj ET`;
    const tokens = tokenizeContent(new TextEncoder().encode(src));
    expect(tokens.some((t) => t.kind === 'hex' && t.value === IBAN)).toBe(true);
    const blanked = blankNeedlesInBytes(new TextEncoder().encode(src), [IBAN]);
    expect(new TextDecoder('latin1').decode(blanked.bytes)).not.toContain(hex);
    expect(blanked.count).toBeGreaterThan(0);
  });
});

describe('pdf-redact', () => {
  it('removes IBAN, Steuer-ID, email and plate from extracted text and verifies', async () => {
    expect(isValidIban(IBAN)).toBe(true);
    const { file, steuer } = await piiPdf();
    const before = await extractAllText(await file.bytes());
    expect(before.joined).toContain(IBAN);
    expect(before.joined).toContain(steuer);
    expect(before.joined).toContain(EMAIL);
    expect(before.joined.replace(/\s+/g, '')).toContain(PLATE.replace(/\s+/g, ''));

    const result = await runTool(
      pdfRedact,
      createToolContext(),
      [file],
      { mode: 'auto', patterns: ['iban', 'steuer-id', 'email', 'kennzeichen'], ner: false },
    );
    const pdfOut = result.outputs.find((f) => f.mime === MIME.pdf)!;
    const after = await extractAllText(await pdfOut.bytes());
    expect(after.joined).not.toContain(IBAN);
    expect(after.joined).not.toContain(steuer);
    expect(after.joined).not.toContain(EMAIL);
    expect(after.joined.replace(/\s+/g, '')).not.toContain(PLATE.replace(/\s+/g, ''));

    const verification = result.report?.verification as VerificationReport;
    expect(verification.passed).toBe(true);

    const golden = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'goldens/pdf-redact/report.json'), 'utf8'),
    ) as { hitCounts: Record<string, number>; rasterizedPages: number[]; verificationPassed: boolean };
    const files = result.report?.files as Array<{
      hits: Array<{ pattern: string; count: number }>;
      rasterizedPages: number[];
    }>;
    const counts: Record<string, number> = {};
    for (const row of files[0]?.hits ?? []) counts[row.pattern] = (counts[row.pattern] ?? 0) + row.count;
    expect(counts.iban).toBe(golden.hitCounts.iban);
    expect(counts['steuer-id']).toBe(golden.hitCounts['steuer-id']);
    expect(counts.email).toBe(golden.hitCounts.email);
    expect(counts.kennzeichen).toBe(golden.hitCounts.kennzeichen);
    expect(files[0]?.rasterizedPages).toEqual(golden.rasterizedPages);
    expect(verification.passed).toBe(golden.verificationPassed);
  });

  it('region redaction removes the text underneath', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([400, 300]);
    page.drawText('SECRETVALUE', { x: 50, y: 180, size: 16, font });
    page.drawText('KEEPME', { x: 50, y: 80, size: 16, font });
    const file = neoFileFromBytes('region.pdf', await doc.save(), MIME.pdf);
    const result = await runTool(
      pdfRedact,
      createToolContext(),
      [file],
      {
        mode: 'manual',
        patterns: [],
        regions: [{ page: 1, x: 48, y: 176, w: 140, h: 22 }],
        ner: false,
      },
    );
    const text = (await extractAllText(await result.outputs[0]!.bytes())).joined;
    expect(text).not.toContain('SECRETVALUE');
    expect(text).toContain('KEEPME');
    expect((result.report?.verification as VerificationReport).passed).toBe(true);
  });

  it('flags overlay-only PDFs (regression: black rect without text removal)', async () => {
    const { file } = await piiPdf();
    const doc = await PDFDocument.load(await file.bytes());
    const page = doc.getPage(0);
    page.drawRectangle({ x: 0, y: 0, width: 500, height: 400, color: rgb(0, 0, 0) });
    const overlaid = neoFileFromBytes('overlay.pdf', await doc.save(), MIME.pdf);
    const still = await extractAllText(await overlaid.bytes());
    expect(still.joined).toContain(IBAN);
    const report = await verifyRedactedPdf(createToolContext(), [overlaid], {
      mode: 'auto',
      patterns: ['iban'],
      strings: [IBAN],
    });
    expect(report.passed).toBe(false);
    expect(report.checks.some((c) => !c.passed && c.id.endsWith(':text'))).toBe(true);
  });

  it('ignores pdf-lib CreationDate when scanning metadata for phone numbers', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const file = neoFileFromBytes('dates.pdf', await doc.save(), MIME.pdf);
    const report = await verifyRedactedPdf(createToolContext(), [file], {
      mode: 'auto',
      patterns: ['telefon'],
    });
    expect(report.checks.find((c) => c.id.endsWith(':meta'))?.passed).toBe(true);
    expect(report.passed).toBe(true);
  });
});
