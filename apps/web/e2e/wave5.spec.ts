import { expect, test } from '@playwright/test';
import { PDFDocument, PDFDict, PDFName, StandardFonts } from 'pdf-lib';
import {
  applyWorkspaceTool,
  attachGuards,
  downloadExport,
  dropWorkspaceFiles,
  expectMoved,
  IBAN,
  openWorkspace,
  readDownloadBytes,
  tinyPng,
  waitWorkspaceIdle,
} from './helpers';

test('launch: /preise, /vergleich/ilovepdf, /impressum, /datenschutz', async ({ page }) => {
  const guards = attachGuards(page);
  await expectMoved(page, '/preise', '/info/preise');
  await page.goto('/info/preise');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('body')).toContainText(/Community|frei|free/i);

  await expectMoved(page, '/vergleich/ilovepdf', '/info/vergleich/ilovepdf');
  await page.goto('/info/vergleich/ilovepdf');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('body')).toContainText(/iLovePDF|Upload|lokal/i);

  await expectMoved(page, '/impressum', '/info/impressum');
  await page.goto('/info/impressum');
  await expect(page.locator('body')).toContainText(/Vorlage|§ 5|DDG|keine Rechtsberatung/i);

  await expectMoved(page, '/datenschutz', '/info/datenschutz');
  await page.goto('/info/datenschutz');
  await expect(page.locator('body')).toContainText(/Vorlage|keine Rechtsberatung|lokal/i);
  guards.assertClean();
});

test('creator-social-card: PNG → PNG download', async ({ page }) => {
  test.setTimeout(90_000);
  const guards = attachGuards(page);
  await openWorkspace(page, '/creator-social-card');
  await dropWorkspaceFiles(page, [{ name: 'hero.png', mimeType: 'image/png', buffer: tinyPng() }]);
  await expect(page.locator('[data-workspace]')).toHaveAttribute('data-kind', 'image');
  await applyWorkspaceTool(page, 'creator-social-card');
  const download = await downloadExport(page);
  const bytes = await readDownloadBytes(download);
  expect(bytes[0]).toBe(0x89);
  expect(bytes[1]).toBe(0x50);
  expect(bytes[2]).toBe(0x4e);
  expect(bytes[3]).toBe(0x47);
  expect(guards.foreignRequests, `foreign origins:\n${guards.foreignRequests.join('\n')}`).toEqual([]);
  // encode/canvas may log a revoked blob as Chromium ERR_FILE_NOT_FOUND
  expect(guards.consoleErrors.filter((e) => !/ERR_FILE_NOT_FOUND/.test(e))).toEqual([]);
});

test('pdf-redact Form-XObject: Verifikation nie leer', async ({ page }) => {
  test.setTimeout(90_000);
  const guards = attachGuards(page);
  await openWorkspace(page, '/pdf-redact');
  await dropWorkspaceFiles(page, [{ name: 'form-xobject.pdf', mimeType: 'application/pdf', buffer: await formXobjectIban() }]);
  await expect(page.locator('[data-pdf-page]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-options-panel][data-tool="pdf-redact"]')).toBeVisible();
  await page.locator('[data-preset="auto-de"]').click();
  await page.locator('[data-apply]').click();
  await expect(page.locator('[data-step="pdf-redact"][data-status="ok"]')).toBeVisible({ timeout: 60_000 });
  await waitWorkspaceIdle(page);
  const seal = page.locator('[data-step="pdf-redact"] [data-seal]');
  await expect(seal).toBeVisible();
  const state = await seal.getAttribute('data-seal');
  expect(state, 'Siegel darf nicht fehlen').toMatch(/^(ok|fail)$/);
  await expect(seal).toContainText(/Verifiziert|Prüfung fehlgeschlagen|Verified|Check failed/i);
  guards.assertClean();
});

async function formXobjectIban(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 300]);
  const formBytes = new TextEncoder().encode(`BT /F1 12 Tf 1 0 0 1 10 20 Tm (${IBAN}) Tj ET`);
  const form = doc.context.flateStream(formBytes, {
    Type: 'XObject',
    Subtype: 'Form',
    BBox: [0, 0, 300, 80],
    Resources: { Font: { F1: font.ref } },
  });
  const formRef = doc.context.register(form);
  const resources = page.node.lookup(PDFName.of('Resources'));
  const xobj = doc.context.obj({}) as PDFDict;
  xobj.set(PDFName.of('Fm1'), formRef);
  if (resources instanceof PDFDict) resources.set(PDFName.of('XObject'), xobj);
  const contents = new TextEncoder().encode('q 1 0 0 1 40 180 cm /Fm1 Do Q');
  page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream(contents)));
  return Buffer.from(await doc.save());
}
