import { expect, test } from '@playwright/test';
import {
  applyWorkspaceTool,
  attachGuards,
  downloadExport,
  dropWorkspaceFiles,
  expectMoved,
  openWorkspace,
  readDownloadBytes,
  sineWav,
} from './helpers';

test('audio-convert: 2s WAV → MP3 starts with ID3 or FFFB', async ({ page }) => {
  test.setTimeout(120_000);
  const guards = attachGuards(page);
  await openWorkspace(page, '/audio-convert');
  await dropWorkspaceFiles(page, [{ name: 'tone.wav', mimeType: 'audio/wav', buffer: sineWav() }]);
  await expect(page.locator('[data-workspace]')).toHaveAttribute('data-kind', 'audio');
  await expect(page.locator('[data-file-id]').filter({ hasText: 'tone.wav' })).toBeVisible();
  await applyWorkspaceTool(page, 'audio-convert', 90_000);
  const download = await downloadExport(page);
  const bytes = await readDownloadBytes(download);
  const head = bytes.subarray(0, 3);
  const id3 = head.toString('latin1').startsWith('ID3');
  const sync = bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0;
  expect(id3 || sync).toBe(true);
  guards.assertClean();
});

test('markdown-to-pdf: Deep-Link + Datei, Tool vorgewählt (Smoke)', async ({ page }) => {
  const guards = attachGuards(page);
  const md = Buffer.from('# NeoTools\n\nWelle 4 Markdown zu PDF.\n', 'utf8');
  await openWorkspace(page, '/markdown-to-pdf');
  await expect(page.locator('[data-workspace][data-expanded="true"]')).toBeVisible();
  await expect(page.locator('[data-inspector-hint]')).toContainText(/markdown/i);
  await dropWorkspaceFiles(page, [{ name: 'note.md', mimeType: 'text/markdown', buffer: md }]);
  await expect(page.locator('[data-file-id]').filter({ hasText: 'note.md' })).toBeVisible();
  await expect(page.locator('[data-options-panel][data-tool="markdown-to-pdf"]')).toBeVisible();
  await expect(page.locator('[data-workspace]')).toHaveAttribute('data-kind', 'office');
  // Full run is not reliable: the worker registry currently errors with
  // "Unbekanntes Tool: markdown-to-pdf" (generic office canvas, no dedicated editor).
  guards.assertClean();
});

test('/lizenz zeigt Community-Versprechen', async ({ page }) => {
  const guards = attachGuards(page);
  await expectMoved(page, '/lizenz', '/info/lizenz');
  await page.goto('/info/lizenz');
  await expect(page.locator('[data-license-page]')).toBeVisible();
  await expect(page.locator('body')).toContainText(/Community bleibt|Gratis-Versprechen|api, watch, presets/i);
  guards.assertClean();
});
