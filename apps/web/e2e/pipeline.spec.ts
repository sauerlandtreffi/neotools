import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { attachGuards, pdfBytes } from './helpers';

test('pipeline: Vor Versand preset + sanitize → compress', async ({ page }) => {
  const guards = attachGuards(page);
  const dirty = await pdfBytes({ pages: 1, text: 'PipelineSanitize' });
  await page.goto('/pipeline');
  await expect(page.locator('[data-pipeline-ready]')).toBeVisible();
  await page.locator('[data-pipeline-preset="vor-versand"]').click();
  await page.locator('[data-pipeline-files]').setInputFiles({
    name: 'in.pdf',
    mimeType: 'application/pdf',
    buffer: dirty,
  });
  await page.locator('[data-pipeline-run]').click();
  const downloadBtn = page.locator('[data-pipeline-download]').first();
  await expect(downloadBtn).toBeVisible({ timeout: 90_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), downloadBtn.click()]);
  const path = await download.path();
  expect(path).toBeTruthy();
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
  guards.assertClean();
});
