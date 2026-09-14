import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import {
  READER_NEEDLE,
  applyWorkspaceTool,
  attachGuards,
  downloadExport,
  dropWorkspaceFiles,
  expectCoopCoep,
  expectMoved,
  ibanPdf,
  mergeFixturePdfs,
  openWorkspace,
  pdfBytes,
  pickWorkspaceTool,
  readDownloadBytes,
  readerPdf,
  tinyPng,
  waitWorkspaceIdle,
} from './helpers';

test('a) startseite: App-Shell, leerer Landing-Container, COOP/COEP', async ({ page }) => {
  const guards = attachGuards(page);
  await openWorkspace(page);
  await expect(page.locator('[data-workspace][data-embedded="true"][data-expanded="false"]')).toBeVisible();
  await expect(page.locator('[data-empty-state]')).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(0);
  await expect(page.locator('[data-landing]')).toHaveCount(1);
  await expectCoopCoep(page);
  guards.assertClean();
});

test('b) /pdf-merge: zwei PDFs → Download mit 2+ Seiten', async ({ page }) => {
  const guards = attachGuards(page);
  const { a, b } = await mergeFixturePdfs();
  await openWorkspace(page, '/pdf-merge');
  await dropWorkspaceFiles(page, [
    { name: 'a.pdf', mimeType: 'application/pdf', buffer: a },
    { name: 'b.pdf', mimeType: 'application/pdf', buffer: b },
  ]);
  await expect(page.locator('[data-file-id]').filter({ hasText: 'a.pdf' })).toBeVisible();
  await expect(page.locator('[data-file-id]').filter({ hasText: 'b.pdf' })).toBeVisible();

  await pickWorkspaceTool(page, 'transform', 'pdf-merge');
  await expect(page.locator('[data-merge-overlay]')).toBeVisible();
  await page.locator('[data-merge-run]').click();
  await expect(page.locator('[data-file-id]')).toHaveCount(3, { timeout: 60_000 });
  await waitWorkspaceIdle(page);

  const download = await downloadExport(page);
  const bytes = await readDownloadBytes(download);
  expect(bytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
  guards.assertClean();
});

test('c) /pdf-sanitize: Verifikation grün', async ({ page }) => {
  const guards = attachGuards(page);
  await openWorkspace(page, '/pdf-sanitize');
  await dropWorkspaceFiles(page, [{ name: 'in.pdf', mimeType: 'application/pdf', buffer: await pdfBytes({ pages: 1, text: 'SanitizeMe' }) }]);
  await applyWorkspaceTool(page, 'pdf-sanitize');
  await expect(page.locator('[data-step="pdf-sanitize"] [data-seal="ok"]')).toBeVisible({ timeout: 20_000 });
  guards.assertClean();
});

test('d) /pdf-redact: Editor lädt, Seite als Canvas gerendert', async ({ page }) => {
  const guards = attachGuards(page);
  await openWorkspace(page, '/pdf-redact');
  await dropWorkspaceFiles(page, [{ name: 'iban.pdf', mimeType: 'application/pdf', buffer: await ibanPdf() }]);
  await expect(page.locator('[data-pdf-page]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-options-panel][data-tool="pdf-redact"]')).toBeVisible();
  await expect(page.locator('[data-marks]')).toBeVisible();
  guards.assertClean();
});

test('d2) /pdf-redact: Auto-Treffer zeigt IBAN, Schwärzen ist grün', async ({ page }) => {
  const guards = attachGuards(page);
  await openWorkspace(page, '/pdf-redact');
  await dropWorkspaceFiles(page, [{ name: 'iban.pdf', mimeType: 'application/pdf', buffer: await ibanPdf() }]);
  await expect(page.locator('[data-pdf-page]')).toBeVisible({ timeout: 30_000 });

  const redactNow = page.locator('[data-finding-action="redact"]');
  await expect(redactNow).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-finding="iban"]').first()).toBeVisible();
  await redactNow.click();
  await expect(page.locator('[data-marks] li').first()).toContainText(/iban/i);

  await page.locator('[data-apply]').click();
  await expect(page.locator('[data-step="pdf-redact"][data-status="ok"]')).toBeVisible({ timeout: 60_000 });
  await waitWorkspaceIdle(page);
  await expect(page.locator('[data-step="pdf-redact"] [data-seal="ok"]')).toBeVisible({ timeout: 20_000 });
  guards.assertClean();
});

test('e) /reader: 301 → Workspace, PDF öffnen, Seitenzahl, Suche', async ({ page }) => {
  const guards = attachGuards(page);
  await expectMoved(page, '/reader', '/');
  await openWorkspace(page, '/reader');
  expect(new URL(page.url()).pathname).toBe('/');
  await dropWorkspaceFiles(page, [{ name: 'reader.pdf', mimeType: 'application/pdf', buffer: await readerPdf() }]);
  await expect(page.locator('[data-pdf-page]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-thumb]')).toHaveCount(2, { timeout: 20_000 });
  await expect(page.locator('[data-page-input]')).toHaveValue('1');

  await page.locator('[data-search-open]').click();
  await page.locator('[data-search-input]').fill(READER_NEEDLE);
  await expect(page.locator('[data-search-hits]')).toContainText(/1\/\d+/, { timeout: 20_000 });
  guards.assertClean();
});

test('f) /lizenzen listet pdf-lib, pdfjs, tesseract, qpdf', async ({ page }) => {
  const guards = attachGuards(page);
  await expectMoved(page, '/lizenzen', '/info/lizenzen');
  await page.goto('/info/lizenzen');
  const body = await page.locator('body').innerText();
  expect(body).toMatch(/pdf-lib/i);
  expect(body).toMatch(/pdfjs/i);
  expect(body).toMatch(/tesseract/i);
  expect(body).toMatch(/qpdf/i);
  guards.assertClean();
});

test('g) /en/ funktioniert', async ({ page }) => {
  const guards = attachGuards(page);
  await openWorkspace(page, '/en/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('[data-workspace][data-embedded="true"]')).toBeVisible();
  await expect(page.locator('[data-empty-state]')).toBeVisible();
  await expect(page.locator('[data-landing][data-locale="en"]')).toHaveCount(1);
  guards.assertClean();
});

test('h) Service Worker + manifest file_handlers', async ({ page }) => {
  const guards = attachGuards(page);
  await page.goto('/');
  const ready = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(reg.active || reg.waiting || reg.installing);
  });
  expect(ready).toBe(true);

  const manifest = await page.evaluate(async () => {
    const res = await fetch('/manifest.webmanifest');
    return (await res.json()) as {
      file_handlers?: Array<{ accept?: Record<string, string[]> }>;
    };
  });
  const accepts = (manifest.file_handlers ?? []).flatMap((h) => Object.keys(h.accept ?? {}));
  expect(accepts).toContain('application/pdf');
  guards.assertClean();
});

test('i) /image-convert: PNG → JPG beginnt mit FFD8', async ({ page }) => {
  const guards = attachGuards(page);
  await openWorkspace(page, '/image-convert');
  await dropWorkspaceFiles(page, [{ name: 'in.png', mimeType: 'image/png', buffer: tinyPng() }]);
  await expect(page.locator('[data-workspace]')).toHaveAttribute('data-kind', 'image');
  await expect(page.locator('[data-file-id]').filter({ hasText: 'in.png' })).toBeVisible();
  await applyWorkspaceTool(page, 'image-convert');
  const download = await downloadExport(page);
  const bytes = await readDownloadBytes(download);
  expect(bytes[0]).toBe(0xff);
  expect(bytes[1]).toBe(0xd8);
  guards.assertClean();
});

test('j) /formats/jpg rendert unter /info und enthält JSON-LD', async ({ page }) => {
  const guards = attachGuards(page);
  await expectMoved(page, '/formats/jpg', '/info/formats/jpg');
  await page.goto('/info/formats/jpg');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('h1')).toContainText(/JPEG/i);
  const jsonLd = page.locator('script[type="application/ld+json"]');
  expect(await jsonLd.count()).toBeGreaterThan(0);
  const blobs = await jsonLd.allTextContents();
  expect(blobs.join('\n')).toMatch(/TechArticle|FAQPage|BreadcrumbList/);
  guards.assertClean();
});

test('k) /verlauf zeigt nach einem Tool-Lauf eine Session', async ({ page }) => {
  const guards = attachGuards(page);
  const { a, b } = await mergeFixturePdfs();
  await openWorkspace(page, '/pdf-merge');
  await dropWorkspaceFiles(page, [
    { name: 'a.pdf', mimeType: 'application/pdf', buffer: a },
    { name: 'b.pdf', mimeType: 'application/pdf', buffer: b },
  ]);
  await pickWorkspaceTool(page, 'transform', 'pdf-merge');
  await page.locator('[data-merge-run]').click();
  await expect(page.locator('[data-file-id]')).toHaveCount(3, { timeout: 60_000 });
  await waitWorkspaceIdle(page);

  await expectMoved(page, '/verlauf', '/?panel=history');
  await page.goto('/verlauf');
  await expect(page.locator('[data-panel="history"] [data-session-row]').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-panel="history"] [data-session-row]').first()).toContainText(/a\.pdf|merged/i);
  guards.assertClean();
});
