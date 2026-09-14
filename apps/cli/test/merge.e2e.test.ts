import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { EXIT_OK, runCli } from '../src/cli.js';

async function writeSample(dir: string, name: string, text: string): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 200]);
  page.drawText(text, { x: 40, y: 100, size: 16, font });
  const path = join(dir, name);
  await writeFile(path, await doc.save());
  return path;
}

describe('CLI pdf-merge e2e', () => {
  it('merges two generated PDFs into outDir', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'neotools-cli-'));
    const a = await writeSample(dir, 'a.pdf', 'Alpha');
    const b = await writeSample(dir, 'b.pdf', 'Beta');
    const out = join(dir, 'out');
    const logs: string[] = [];
    const code = await runCli(['run', 'pdf-merge', a, b, '-o', out, '--output-name', 'merged.pdf'], {
      stdout: (m) => logs.push(String(m)),
      stderr: () => undefined,
    });
    expect(code).toBe(EXIT_OK);
    const merged = join(out, 'merged.pdf');
    const bytes = await readFile(merged);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(logs.some((l) => l.includes('merged.pdf'))).toBe(true);
  });
});
