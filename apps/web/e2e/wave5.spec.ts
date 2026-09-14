import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PDFDocument, PDFDict, PDFName, StandardFonts } from 'pdf-lib';
import { attachGuards, IBAN, tinyPng, uploadFiles, uploadPdfs } from './helpers';

test('launch: /preise, /vergleich/ilovepdf, /impressum, /datenschutz', async ({ page }) => {
  const guards = attachGuards(page);
  await page.goto('/preise');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('body')).toContainText(/Community|frei|free/i);

  await page.goto('/vergleich/ilovepdf');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('body')).toContainText(/iLovePDF|Upload|lokal/i);

  await page.goto('/impressum');
  await expect(page.locator('body')).toContainText(/Vorlage|§ 5|DDG|keine Rechtsberatung/i);

  await page.goto('/datenschutz');
  await expect(page.locator('body')).toContainText(/Vorlage|keine Rechtsberatung|lokal/i);
  guards.assertClean();
});

test('creator-social-card: PNG → PNG download', async ({ page }) => {
  test.setTimeout(90_000);
  const guards = attachGuards(page);
  await page.goto('/creator-social-card');
  await uploadFiles(page, [{ name: 'hero.png', mimeType: 'image/png', buffer: tinyPng() }]);
  await page.getByRole('button', { name: 'Ausführen' }).click();
  const downloadBtn = page.getByRole('button', { name: 'Download' });
  await expect(downloadBtn).toBeVisible({ timeout: 60_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), downloadBtn.click()]);
  const path = await download.path();
  expect(path).toBeTruthy();
  const bytes = await readFile(path!);
  expect(bytes[0]).toBe(0x89);
  expect(bytes[1]).toBe(0x50);
  expect(bytes[2]).toBe(0x4e);
  expect(bytes[3]).toBe(0x47);
  guards.assertClean();
});

test('pdf-redact Form-XObject: Verifikation nie leer', async ({ page }) => {
  test.setTimeout(90_000);
  const guards = attachGuards(page);
  const pdf = await formXobjectIban();
  await page.goto('/pdf-redact');
  await uploadPdfs(page, [{ name: 'form-xobject.pdf', buffer: pdf }]);
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Auto-Treffer' }).click();
  await page.getByRole('button', { name: 'Schwärzen & verifizieren' }).click();
  const block = page.locator('section').filter({ hasText: 'Verifikation' });
  await expect(block).toBeVisible({ timeout: 60_000 });
  const text = await block.innerText();
  expect(text.length).toBeGreaterThan(12);
  // Never empty: a verdict line plus at least one concrete check line.
  const heading = await block.locator('h2').first().innerText();
  expect(heading).toMatch(/Verifikation · (bestanden|fehlgeschlagen)/i);
  const lines = await block.locator('li').allInnerTexts();
  expect(lines.length).toBeGreaterThan(0);
  expect(lines.some((l) => /^(OK|FAIL|WARN)\s/.test(l))).toBe(true);
  if (/fehlgeschlagen/i.test(heading)) {
    // red must come with a reason: a FAIL/WARN line that carries a message
    const reasons = lines.filter((l) => /^(FAIL|WARN)\s/.test(l) && l.replace(/^(FAIL|WARN)\s*/, '').trim().length > 8);
    expect(reasons, lines.join('\n')).not.toEqual([]);
  } else {
    // green must be honest: no FAIL line hidden below, and the IBAN byte-scan check is present
    expect(lines.some((l) => /^FAIL\s/.test(l)), lines.join('\n')).toBe(false);
    expect(lines.some((l) => /:bytes|:text/.test(l))).toBe(true);
  }
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
