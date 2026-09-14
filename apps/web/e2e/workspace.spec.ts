import { expect, test, type Page } from '@playwright/test';
import { attachGuards, ibanPdf, pdfBytes } from './helpers';

/**
 * Workspace flows — FRONTEND-REDESIGN W0–W2 DoD + §11 (app on `/`).
 * One tab, one stack: drop → analyse → redact → compress → delete page → undo → export.
 */

async function openApp(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.locator('[data-workspace][data-ready="true"]')).toBeVisible({ timeout: 20_000 });
}

async function dropPdf(page: Page, name: string, buffer: Buffer) {
  const input = page.locator('[data-empty-input], [data-tray-input]').first();
  await input.setInputFiles([{ name, mimeType: 'application/pdf', buffer }]);
  await expect(page.locator('[data-workspace][data-has-files="true"]')).toBeVisible({ timeout: 20_000 });
}

async function waitIdle(page: Page) {
  await expect(page.locator('[data-jobdock]')).toHaveCount(0, { timeout: 60_000 });
}

/** Tools live in verb-grouped menus of the toolbar (§11.1/3). */
async function pickTool(page: Page, group: string, toolId: string) {
  await page.locator(`[data-actionbar] [data-tool-group="${group}"]`).click();
  await page.locator(`[data-tool-menu="${group}"] [data-tool="${toolId}"]`).click();
}

test('w2) /: drop → analyse → schwärzen → komprimieren → seite löschen → undo → export, ohne seitenwechsel', async ({ page }) => {
  const guards = attachGuards(page);
  await openApp(page);
  await expect(page.locator('[data-empty-state]')).toBeVisible();
  // app-first: the shell is the first viewport, no marketing hero
  await expect(page.locator('[data-workspace][data-embedded="true"][data-expanded="false"]')).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(0);

  const pdf = await pdfBytes({ pages: 3, text: 'Akte', extraLines: ['IBAN DE89370400440532013000'] });
  await dropPdf(page, 'akte.pdf', pdf);
  // the shell expands to full screen once a file is in
  await expect(page.locator('[data-workspace][data-expanded="true"]')).toBeVisible();
  await expect(page.locator('[data-workspace]')).toHaveAttribute('data-kind', 'pdf');
  expect(Number(await page.locator('[data-actionbar]').getAttribute('data-tool-count'))).toBeGreaterThanOrEqual(15);

  // canvas + thumbs
  await expect(page.locator('[data-pdf-page]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-thumb]')).toHaveCount(3, { timeout: 20_000 });
  await expect(page.locator('[data-stepstack]')).toBeVisible();

  // auto-analysis: IBAN finding with one-click redact
  const redactNow = page.locator('[data-finding-action="redact"]');
  await expect(redactNow).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-finding="iban"]').first()).toBeVisible();
  await redactNow.click();
  await expect(page.locator('[data-options-panel][data-tool="pdf-redact"]')).toBeVisible();
  await expect(page.locator('[data-marks] li').first()).toContainText(/iban/i);
  await page.locator('[data-apply]').click();
  await expect(page.locator('[data-step="pdf-redact"][data-status="ok"]')).toBeVisible({ timeout: 60_000 });
  await waitIdle(page);
  await expect(page.locator('[data-step="pdf-redact"] [data-seal="ok"]')).toBeVisible({ timeout: 20_000 });

  // compress
  await pickTool(page, 'transform', 'pdf-compress');
  await expect(page.locator('[data-options-panel][data-tool="pdf-compress"]')).toBeVisible();
  await expect(page.locator('[data-fit-slider]')).toBeVisible();
  await page.locator('[data-apply]').click();
  await expect(page.locator('[data-step="pdf-compress"][data-status="ok"]')).toBeVisible({ timeout: 60_000 });
  await waitIdle(page);

  // delete page 3 via thumb rail
  await page.locator('[data-thumb="3"]').click();
  await page.locator('[data-thumb-delete]').click();
  await expect(page.locator('[data-step="pdf-reorder"][data-status="ok"]')).toBeVisible({ timeout: 60_000 });
  await waitIdle(page);
  await expect(page.locator('[data-thumb]')).toHaveCount(2, { timeout: 20_000 });

  // undo → 3 pages again, head moves back
  await page.locator('[data-undo]').click();
  await expect(page.locator('[data-thumb]')).toHaveCount(3, { timeout: 20_000 });
  await expect(page.locator('[data-step="pdf-compress"][data-current="true"]')).toBeVisible();
  await expect(page.locator('[data-step="pdf-reorder"][data-future="true"]')).toBeVisible();

  // export drawer → download
  await page.locator('[data-open-export]').first().click();
  await expect(page.locator('[data-export-drawer]')).toBeVisible();
  // fail-closed: compress invalidated the redact verification → unknown; "Jetzt prüfen" runs share-safe report-only
  await expect(page.locator('[data-sharesafe-light="unknown"]')).toBeVisible();
  await page.locator('[data-sharesafe-check]').click();
  await expect(page.locator('[data-sharesafe-light="yes"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-thumb]')).toHaveCount(3); // report-only step never replaced the document
  const download = page.waitForEvent('download');
  await page.locator('[data-export-download]').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.pdf$/);

  // never left /, no foreign origin
  expect(new URL(page.url()).pathname).toBe('/');
  guards.assertClean();
});

test('w1) reload behält session, verlauf listet sie', async ({ page }) => {
  await openApp(page);
  await dropPdf(page, 'reload-a.pdf', await pdfBytes({ pages: 1, text: 'ReloadA' }));
  await page.locator('[data-tray-input]').setInputFiles([{ name: 'reload-b.pdf', mimeType: 'application/pdf', buffer: await pdfBytes({ pages: 1, text: 'ReloadB' }) }]);
  await expect(page.locator('[data-file-id]')).toHaveCount(2, { timeout: 20_000 });
  await expect(page).toHaveURL(/session=s[a-z0-9]+/);
  const url = page.url();

  await page.reload();
  await expect(page.locator('[data-workspace][data-ready="true"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-file-id]')).toHaveCount(2, { timeout: 20_000 });
  expect(page.url()).toBe(url);

  // sessions live in the bin; the old /verlauf route redirects into the app panel
  await expect(page.locator('[data-sessions] [data-recent]').first()).toBeVisible();
  const res = await page.request.get('/verlauf', { maxRedirects: 0 });
  expect(res.status()).toBe(301);
  expect(res.headers()['location']).toBe('/?panel=history');
  await page.goto('/verlauf');
  await expect(page.locator('[data-panel="history"] [data-session-row]').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-panel="history"] [data-session-row]').first()).toContainText(/reload-a/i);
});

test('w0) deep-link ?tool= öffnet options-panel, dark mode persistiert, noindex', async ({ page }) => {
  await openApp(page, '/app?tool=pdf-compress');
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
  await dropPdf(page, 'deep.pdf', await pdfBytes({ pages: 1, text: 'Deep' }));
  await expect(page.locator('[data-options-panel][data-tool="pdf-compress"]')).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/tool=pdf-compress/);

  // dark mode toggle persists across reload
  await page.locator('[data-theme-toggle]').first().click();
  await expect(page.locator('html.dark')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('html.dark')).toHaveCount(1, { timeout: 20_000 });
  expect(await page.evaluate(() => localStorage.getItem('neotools-theme'))).toBe('dark');
});

test('§11) deep-link /pdf-compress öffnet die expandierte shell mit dem tool, noindex + canonical → /info', async ({ page }) => {
  await page.goto('/pdf-compress');
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/info\/tools\/pdf-compress$/);
  await expect(page.locator('[data-workspace][data-ready="true"][data-expanded="true"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-inspector-hint]')).toContainText(/kompri/i);
  await dropPdf(page, 'landing.pdf', await ibanPdf());
  await expect(page.locator('[data-file-id]').first()).toContainText('landing.pdf');
  await expect(page.locator('[data-options-panel][data-tool="pdf-compress"]')).toBeVisible({ timeout: 20_000 });
  expect(new URL(page.url()).pathname).toBe('/pdf-compress');
  // the documentation moved to /info
  const doc = await page.request.get('/info/tools/pdf-compress');
  expect(doc.status()).toBe(200);
  const old = await page.request.get('/formats/jpg', { maxRedirects: 0 });
  expect(old.status()).toBe(301);
  expect(old.headers()['location']).toBe('/info/formats/jpg');
});

test('w2) mobile: tabbar, sheets, canvas sichtbar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await dropPdf(page, 'mobile.pdf', await pdfBytes({ pages: 2, text: 'Mobile' }));
  await expect(page.locator('[data-pdf-page]')).toBeVisible({ timeout: 20_000 });
  const tabbar = page.locator('.ws-tabbar');
  await expect(tabbar).toBeVisible();
  await tabbar.getByRole('button').nth(2).click();
  await expect(page.locator('[data-stepstack]')).toBeVisible();
  await page.keyboard.press('Escape');
  await tabbar.getByRole('button').nth(0).click();
  await expect(page.locator('[data-file-id]').first()).toBeVisible();
});
