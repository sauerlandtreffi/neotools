import { expect, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const IBAN = 'DE89370400440532013000';
export const READER_NEEDLE = 'NeoToolsAlpha';

const OPAQUE = /^(blob:|data:|about:|chrome:|chrome-extension:)/i;

export function isAllowedNetworkUrl(url: string): boolean {
  if (OPAQUE.test(url)) return true;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export interface PageGuards {
  consoleErrors: string[];
  foreignRequests: string[];
  assertClean(): void;
}

export function attachGuards(page: Page): PageGuards {
  const consoleErrors: string[] = [];
  const foreignRequests: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  page.on('request', (req) => {
    const url = req.url();
    if (!isAllowedNetworkUrl(url)) foreignRequests.push(url);
  });

  return {
    consoleErrors,
    foreignRequests,
    assertClean() {
      expect(consoleErrors, `console.error:\n${consoleErrors.join('\n')}`).toEqual([]);
      expect(foreignRequests, `foreign origins:\n${foreignRequests.join('\n')}`).toEqual([]);
    },
  };
}

export async function pdfBytes(opts: {
  pages?: number;
  text?: string;
  extraLines?: string[];
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = opts.pages ?? 1;
  const text = opts.text ?? 'NeoTools';
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([400, 400]);
    page.drawText(`${text} p${i + 1}`, {
      x: 40,
      y: 320,
      size: 16,
      font,
      color: rgb(0, 0, 0),
    });
    for (const [idx, line] of (opts.extraLines ?? []).entries()) {
      page.drawText(line, {
        x: 40,
        y: 280 - idx * 22,
        size: 14,
        font,
        color: rgb(0, 0, 0),
      });
    }
  }
  return Buffer.from(await doc.save());
}

export async function mergeFixturePdfs(): Promise<{ a: Buffer; b: Buffer }> {
  return {
    a: await pdfBytes({ pages: 1, text: 'MergeA' }),
    b: await pdfBytes({ pages: 1, text: 'MergeB' }),
  };
}

export async function ibanPdf(): Promise<Buffer> {
  return pdfBytes({
    pages: 1,
    text: 'Akte',
    extraLines: [`IBAN ${IBAN}`],
  });
}

export async function readerPdf(): Promise<Buffer> {
  return pdfBytes({ pages: 2, text: READER_NEEDLE });
}

export async function uploadPdfs(page: Page, files: Array<{ name: string; buffer: Buffer }>) {
  await page.locator('input[type="file"]').setInputFiles(
    files.map((file) => ({
      name: file.name,
      mimeType: 'application/pdf',
      buffer: file.buffer,
    })),
  );
}

export async function expectCoopCoep(page: Page) {
  const path = page.url() ? new URL(page.url()).pathname : '/';
  const res = await page.request.get(path);
  const headers = res.headers();
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['cross-origin-embedder-policy']).toBe('credentialless');
}
