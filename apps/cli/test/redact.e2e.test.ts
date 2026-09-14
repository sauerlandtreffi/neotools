import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.js';

describe('CLI pdf-redact', () => {
  it('runs auto patterns and prints a verification line', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'neotools-redact-'));
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([400, 240]);
    page.drawText('DE89370400440532013000', { x: 40, y: 140, size: 14, font });
    const input = join(dir, 'in.pdf');
    await writeFile(input, await doc.save());
    const out = join(dir, 'out');
    const logs: string[] = [];
    const code = await runCli(
      ['run', 'pdf-redact', '--mode', 'auto', '--patterns', 'iban,steuer-id', input, '-o', out],
      { stdout: (m) => logs.push(String(m)), stderr: () => undefined },
    );
    expect(logs.some((l) => /verification: (passed|failed)/.test(l))).toBe(true);
    const pdfs = logs.filter((l) => l.endsWith('.pdf'));
    expect(pdfs.length).toBeGreaterThan(0);
    const bytes = await readFile(pdfs[0]!);
    expect(bytes.byteLength).toBeGreaterThan(100);
    expect([0, 4]).toContain(code);
  });
});
