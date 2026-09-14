import { readFile } from 'node:fs/promises';
import { expect, type Download, type Page } from '@playwright/test';
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
  await uploadFiles(
    page,
    files.map((file) => ({ name: file.name, mimeType: 'application/pdf', buffer: file.buffer })),
  );
}

export async function openWorkspace(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.locator('[data-workspace][data-ready="true"]')).toBeVisible({ timeout: 20_000 });
}

export async function dropWorkspaceFiles(
  page: Page,
  files: Array<{ name: string; mimeType: string; buffer: Buffer }>,
) {
  const input = page.locator('[data-empty-input], [data-tray-input]').first();
  await input.setInputFiles(files);
  await expect(page.locator('[data-workspace][data-has-files="true"]')).toBeVisible({ timeout: 20_000 });
}

/** Tools live in verb-grouped menus of the toolbar. */
export async function pickWorkspaceTool(page: Page, group: string, toolId: string) {
  await page.locator(`[data-actionbar] [data-tool-group="${group}"]`).click();
  await page.locator(`[data-tool-menu="${group}"] [data-tool="${toolId}"]`).click();
}

export async function waitWorkspaceIdle(page: Page, timeout = 90_000) {
  await expect(page.locator('[data-jobdock]')).toHaveCount(0, { timeout });
}

export async function applyWorkspaceTool(page: Page, toolId: string, timeout = 60_000) {
  await expect(page.locator(`[data-options-panel][data-tool="${toolId}"]`)).toBeVisible({ timeout: 20_000 });
  const ok = page.locator(`[data-step="${toolId}"][data-status="ok"]`);
  const err = page.locator(`[data-step="${toolId}"][data-status="error"]`);
  const deadline = Date.now() + timeout;
  // Worker packs load lazily (`warmFamily` vs first `run`). A too-early apply
  // surfaces as "Unbekanntes Tool" — retry after the import can finish.
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.locator('[data-apply]').click();
    const slice = Math.max(8_000, Math.min(30_000, deadline - Date.now()));
    try {
      await expect(ok).toBeVisible({ timeout: slice });
      await waitWorkspaceIdle(page);
      return;
    } catch (e) {
      const failed = (await err.count()) > 0 && /Unbekanntes Tool/i.test(await err.last().innerText());
      if (!failed || Date.now() >= deadline) throw e;
      await page.waitForTimeout(1_000);
    }
  }
}

export async function downloadExport(page: Page): Promise<Download> {
  await page.locator('[data-open-export]').first().click();
  await expect(page.locator('[data-export-drawer]')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.locator('[data-export-download]').click();
  return download;
}

export async function readDownloadBytes(download: Download): Promise<Buffer> {
  const path = await download.path();
  expect(path, 'Playwright sollte die Datei speichern').toBeTruthy();
  return readFile(path!);
}

export async function expectMoved(page: Page, from: string, to: string) {
  const res = await page.request.get(from, { maxRedirects: 0 });
  expect(res.status(), `${from} should 301`).toBe(301);
  expect(res.headers()['location']).toBe(to);
}

export async function uploadFiles(
  page: Page,
  files: Array<{ name: string; mimeType: string; buffer: Buffer }>,
) {
  const workspace = page.locator('[data-empty-input], [data-tray-input]');
  if ((await workspace.count()) > 0) {
    await dropWorkspaceFiles(page, files);
    return;
  }
  const island = page.locator('[data-tool-ready], [data-reader-ready]');
  if ((await island.count()) > 0) {
    await expect(page.locator('[data-tool-ready="1"], [data-reader-ready="1"]')).toBeVisible({
      timeout: 20_000,
    });
  }
  const dropInput = page.locator('section[role="group"] input[type="file"]');
  const input = (await dropInput.count()) > 0 ? dropInput : page.locator('input[type="file"]').first();
  await input.setInputFiles(files);
  if ((await dropInput.count()) > 0 && files[0]) {
    await expect(page.getByText(files[0].name, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });
  }
}

/** 2 s mono PCM WAV (no FFmpeg) for audio-convert smokes. */
export function sineWav(seconds = 2, sampleRate = 8000): Buffer {
  const n = seconds * sampleRate;
  const dataSize = n * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < n; i++) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    buf.writeInt16LE(Math.round(sample * 20000), 44 + i * 2);
  }
  return buf;
}

/** 2×2 opaque PNG (IHDR+IDAT+IEND), valid for image-convert. */
export function tinyPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}

export async function expectCoopCoep(page: Page) {
  const path = page.url() ? new URL(page.url()).pathname : '/';
  const res = await page.request.get(path);
  const headers = res.headers();
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['cross-origin-embedder-policy']).toBe('credentialless');
}
