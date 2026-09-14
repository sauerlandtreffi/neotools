import { PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { MIME, createToolContext, runTool } from '@neotools/engine';
import type { VerificationReport } from '@neotools/engine';
import { pdfSanitize } from '../src/tools/pdf-sanitize.js';
import { inspectPdf } from '../src/inspect.js';
import { inspectExtra } from '../src/inspect-extra.js';
import { makePdf } from './helpers.js';

describe('pdf-sanitize verify-on-bytes', () => {
  it('reloads saved bytes and reports remaining privacy flags', async () => {
    const src = await makePdf({
      name: 'dirty.pdf',
      pages: 1,
      title: 'Secret',
      author: 'Hidden',
      withOpenAction: true,
    });
    const result = await runTool(
      pdfSanitize,
      createToolContext(),
      [src],
      { removeAnnotations: true, flattenForms: true },
    );
    const verification = result.report?.verification as VerificationReport;
    expect(verification.passed).toBe(true);
    expect(verification.checks.every((c) => c.passed)).toBe(true);

    const pdfOut = result.outputs.find((f) => f.mime === MIME.pdf)!;
    const after = await PDFDocument.load(await pdfOut.bytes());
    expect(inspectPdf(after).hasOpenAction).toBe(false);
    expect(inspectPdf(after).hasInfo).toBe(false);
    expect(inspectExtra(after).pageMetadataStreams).toBe(0);
    expect(after.catalog.has(PDFName.of('OpenAction'))).toBe(false);
  });
});
