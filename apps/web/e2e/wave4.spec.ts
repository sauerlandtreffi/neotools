import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { attachGuards, sineWav, uploadFiles } from './helpers';

test('audio-convert: 2s WAV → MP3 starts with ID3 or FFFB', async ({ page }) => {
  test.setTimeout(120_000);
  const guards = attachGuards(page);
  await page.goto('/audio-convert');
  await uploadFiles(page, [{ name: 'tone.wav', mimeType: 'audio/wav', buffer: sineWav() }]);
  await expect(page.getByText('tone.wav')).toBeVisible();
  await page.getByRole('button', { name: 'Ausführen' }).click();
  const downloadBtn = page.getByRole('button', { name: 'Download' });
  await expect(downloadBtn).toBeVisible({ timeout: 120_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), downloadBtn.click()]);
  const path = await download.path();
  expect(path).toBeTruthy();
  const bytes = await readFile(path!);
  const head = bytes.subarray(0, 3);
  const id3 = head.toString('latin1').startsWith('ID3');
  const sync = bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0;
  expect(id3 || sync).toBe(true);
  guards.assertClean();
});

test('markdown-to-pdf: source text → %PDF download', async ({ page }) => {
  const guards = attachGuards(page);
  await page.goto('/markdown-to-pdf');
  await expect(page.locator('[data-tool-ready="1"]')).toBeVisible({ timeout: 20_000 });
  const source = page.locator('textarea').first();
  await source.fill('# NeoTools\n\nWelle 4 Markdown zu PDF.');
  await page.getByRole('button', { name: 'Ausführen' }).click();
  const downloadBtn = page.getByRole('button', { name: 'Download' });
  await expect(downloadBtn).toBeVisible({ timeout: 45_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), downloadBtn.click()]);
  const path = await download.path();
  expect(path).toBeTruthy();
  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  guards.assertClean();
});

test('/lizenz zeigt Community-Versprechen', async ({ page }) => {
  const guards = attachGuards(page);
  await page.goto('/lizenz');
  await expect(page.locator('[data-license-page]')).toBeVisible();
  await expect(page.locator('body')).toContainText(/Community bleibt|Gratis-Versprechen|api, watch, presets/i);
  guards.assertClean();
});
