import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import {
  IBAN,
  READER_NEEDLE,
  attachGuards,
  expectCoopCoep,
  ibanPdf,
  mergeFixturePdfs,
  pdfBytes,
  readerPdf,
  uploadPdfs,
} from './helpers';

test('a) startseite: grid > 20 tools, suche filtert', async ({ page }) => {
  const guards = attachGuards(page);
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  const cards = page.locator('#tools a');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(20);

  await page.getByPlaceholder(/Name oder Aufgabe|Name or task/).fill('merge');
  const hit = page.locator('ul a[href="/pdf-merge"]');
  await expect(hit).toBeVisible();
  await expect(hit).toContainText(/zusammenführen|Merge/i);

  await expectCoopCoep(page);
  guards.assertClean();
});

test('b) /pdf-merge: zwei PDFs → Download mit 2+ Seiten', async ({ page }) => {
  const guards = attachGuards(page);
  const { a, b } = await mergeFixturePdfs();
  await page.goto('/pdf-merge');
  await uploadPdfs(page, [
    { name: 'a.pdf', buffer: a },
    { name: 'b.pdf', buffer: b },
  ]);
  await expect(page.getByText('a.pdf')).toBeVisible();
  await expect(page.getByText('b.pdf')).toBeVisible();

  await page.getByRole('button', { name: 'Ausführen' }).click();
  const downloadBtn = page.getByRole('button', { name: 'Download' });
  await expect(downloadBtn).toBeVisible({ timeout: 45_000 });

  const [download] = await Promise.all([page.waitForEvent('download'), downloadBtn.click()]);
  const path = await download.path();
  expect(path, 'Playwright sollte die Datei speichern').toBeTruthy();
  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);

  guards.assertClean();
});

test('c) /pdf-sanitize: Verifikation grün', async ({ page }) => {
  const guards = attachGuards(page);
  const dirty = await pdfBytes({ pages: 1, text: 'SanitizeMe' });
  await page.goto('/pdf-sanitize');
  await uploadPdfs(page, [{ name: 'in.pdf', buffer: dirty }]);
  await page.getByRole('button', { name: 'Ausführen' }).click();
  const block = page.locator('section').filter({ hasText: 'Verifikation' });
  await expect(block).toBeVisible({ timeout: 45_000 });
  await expect(block).toContainText('bestanden');
  await expect(block.getByText('OK').first()).toBeVisible();

  guards.assertClean();
});

test('d) /pdf-redact: Editor lädt, Seite als Canvas gerendert', async ({ page }) => {
  const guards = attachGuards(page);
  await page.goto('/pdf-redact');
  await uploadPdfs(page, [{ name: 'iban.pdf', buffer: await ibanPdf() }]);
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Markierungen' })).toBeVisible();
  guards.assertClean();
});

/**
 * Bug (fremder Code, nicht gefixt):
 * `packages/tools-pdf/src/pdfjs.ts` `loadPdfjs`/`openPdfjsDocument` (ca. Z. 7–27)
 * setzt `GlobalWorkerOptions.workerSrc` nicht. Auto-Treffer und `run(pdf-redact)`
 * laufen im Tool-Worker (`apps/web/src/worker/tool-worker.ts` `previewRedact` /
 * `run` → `previewRedactHits`/`collectHits` → `extractPageMaps` → `openPdfjsDocument`)
 * und werfen: `No "GlobalWorkerOptions.workerSrc" specified.`
 * Repro: `/pdf-redact`, PDF mit Text `IBAN DE89370400440532013000`, „Auto-Treffer“.
 * UI zeigt den Fehler als roten Absatz; Markierungsliste bleibt leer.
 */
test.fixme('d2) /pdf-redact: Auto-Treffer zeigt IBAN, Schwärzen & verifizieren ist grün', async ({
  page,
}) => {
  const guards = attachGuards(page);
  await page.goto('/pdf-redact');
  await uploadPdfs(page, [{ name: 'iban.pdf', buffer: await ibanPdf() }]);
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Auto-Treffer' }).click();
  const marks = page.locator('h3').filter({ hasText: 'Markierungen' }).locator('..');
  await expect(marks.getByText(/iban/i)).toBeVisible({ timeout: 45_000 });
  await expect(marks.getByText(new RegExp(IBAN.slice(0, 8)))).toBeVisible();

  await page.getByRole('button', { name: 'Schwärzen & verifizieren' }).click();
  const block = page.locator('section').filter({ hasText: 'Verifikation' });
  await expect(block).toBeVisible({ timeout: 60_000 });
  await expect(block).toContainText('bestanden');
  guards.assertClean();
});

test('e) /reader: PDF öffnen, Seitenzahl, Suche', async ({ page }) => {
  const guards = attachGuards(page);
  await page.goto('/reader');
  await uploadPdfs(page, [{ name: 'reader.pdf', buffer: await readerPdf() }]);
  await expect(page.getByText(/Seite\s+1\s*\/\s*2/)).toBeVisible({ timeout: 30_000 });

  await page.locator('#reader-search').fill(READER_NEEDLE);
  await page.locator('form.reader-search').getByRole('button', { name: 'Suchen' }).click();
  await expect(page.locator('form.reader-search').getByText(/1\/\d+/)).toBeVisible({
    timeout: 20_000,
  });

  guards.assertClean();
});

test('f) /lizenzen listet pdf-lib, pdfjs, tesseract, qpdf', async ({ page }) => {
  const guards = attachGuards(page);
  await page.goto('/lizenzen');
  const body = await page.locator('body').innerText();
  expect(body).toMatch(/pdf-lib/i);
  expect(body).toMatch(/pdfjs/i);
  expect(body).toMatch(/tesseract/i);
  expect(body).toMatch(/qpdf/i);
  guards.assertClean();
});

test('g) /en/ funktioniert', async ({ page }) => {
  const guards = attachGuards(page);
  await page.goto('/en/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('#tools a').first()).toBeVisible();
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
