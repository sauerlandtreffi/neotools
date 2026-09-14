import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { attachGuards, expectMoved, pdfBytes, readDownloadBytes } from './helpers';

test('pipeline: 301 → Overlay, Vor Versand preset + sanitize → compress', async ({ page }) => {
  test.setTimeout(120_000);
  const guards = attachGuards(page);
  await expectMoved(page, '/pipeline', '/?panel=pipeline');
  await page.goto('/pipeline');
  await expect(page.locator('[data-workspace][data-ready="true"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-panel="pipeline"]')).toBeVisible();
  await expect(page.locator('[data-pipeline-ready]')).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-pipeline-preset="vor-versand"]').click();
  await page.locator('[data-pipeline-files]').setInputFiles({
    name: 'in.pdf',
    mimeType: 'application/pdf',
    buffer: await pdfBytes({ pages: 1, text: 'PipelineSanitize' }),
  });
  await expect(page.locator('[data-pipeline-run]')).toBeEnabled();
  // panel is position:fixed + transform — Playwright treats the button as off-viewport
  await page.locator('[data-pipeline-run]').evaluate((el) => (el as HTMLButtonElement).click());
  const downloadBtn = page.locator('[data-pipeline-download]').first();
  await expect(downloadBtn).toBeVisible({ timeout: 90_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadBtn.evaluate((el) => (el as HTMLButtonElement).click()),
  ]);
  const bytes = await readDownloadBytes(download);
  expect(bytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
  guards.assertClean();
});
