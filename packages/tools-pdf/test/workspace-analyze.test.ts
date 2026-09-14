import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { lintToolDefinition, workspaceToolsFor, MIME } from '@neotools/engine';
import { createPdfRegistry, pdfTools } from '../src/index.js';
import { analyzePdf } from '../src/workspace.js';
import { makePdf } from './helpers.js';

const IBAN = 'DE89370400440532013000';

describe('pdf workspace meta', () => {
  it('every pdf tool declares outputs + workspace family and lints clean', () => {
    for (const tool of pdfTools) {
      expect(tool.workspace, tool.id).toBeDefined();
      expect(lintToolDefinition(tool), tool.id).toEqual([]);
    }
  });

  it('ranks the ActionBar: compress, reorder, rotate, split, merge, redact, sanitize …', () => {
    const list = workspaceToolsFor(createPdfRegistry(), MIME.pdf);
    expect(list.slice(0, 7).map((t) => t.id)).toEqual([
      'pdf-compress',
      'pdf-reorder',
      'pdf-rotate',
      'pdf-split',
      'pdf-merge',
      'pdf-redact',
      'pdf-sanitize',
    ]);
    expect(list.find((t) => t.id === 'pdf-sign')?.desktopOnly).toBe(true);
    expect(list.find((t) => t.id === 'pdf-merge')?.multiFile).toBe(true);
    expect(list.find((t) => t.id === 'pdf-redact')?.destructive).toBe(true);
  });
});

describe('analyzePdf', () => {
  it('finds IBAN hits with regions, JavaScript and metadata', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([500, 400]);
    page.drawText(`IBAN ${IBAN}`, { x: 40, y: 320, size: 14, font, color: rgb(0, 0, 0) });
    doc.setTitle('Akte');
    const bytes = await doc.save();
    const findings = await analyzePdf(bytes);
    const iban = findings.find((f) => f.kind === 'iban');
    expect(iban).toBeDefined();
    expect(iban?.count).toBe(1);
    expect(iban?.suggestedToolId).toBe('pdf-redact');
    const sel = iban?.selection as { regions: Array<{ page: number; unit: string }> };
    expect(sel.regions[0]?.page).toBe(1);
    expect(sel.regions[0]?.unit).toBe('pdf');
    expect(findings.find((f) => f.kind === 'metadata')?.suggestedToolId).toBe('pdf-sanitize');
    expect(findings[0]?.severity).toBe('high');
  });

  it('flags OpenAction JavaScript as high and sorts it first', async () => {
    const file = await makePdf({ withOpenAction: true, text: 'clean' });
    const findings = await analyzePdf(await file.bytes());
    expect(findings.find((f) => f.kind === 'js')?.severity).toBe('high');
    expect(findings[0]?.kind).toBe('js');
    expect(findings.some((f) => f.kind === 'iban')).toBe(false);
  });

  it('never throws on garbage', async () => {
    const findings = await analyzePdf(new TextEncoder().encode('not a pdf'));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe('unreadable');
  });
});
