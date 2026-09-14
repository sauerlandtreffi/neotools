import { describe, expect, it } from 'vitest';
import { createToolContext, MIME, neoFileFromBytes } from '@neotools/engine';
import { generateCii } from '../src/erechnung/generate-cii.js';
import { generateUbl } from '../src/erechnung/generate-ubl.js';
import { generateInvoicePdf } from '../src/erechnung/generate-pdf.js';
import { extractInvoiceXmlFromPdf } from '../src/erechnung/extract-pdf.js';
import { validateInvoiceXml } from '../src/erechnung/validate.js';
import { dachErechnungGenerate } from '../src/tools/dach-erechnung-generate.js';
import { dachErechnungValidate } from '../src/tools/dach-erechnung-validate.js';
import { sampleInvoice } from './helpers.js';

function failedIds(report: Awaited<ReturnType<typeof validateInvoiceXml>>): string[] {
  return [...report.structural, ...report.business, ...report.arithmetic].filter((f) => !f.passed).map((f) => f.id);
}

describe('e-invoice generate + validate', () => {
  it('CII and UBL from the generator validate green', async () => {
    const data = sampleInvoice();
    const cii = generateCii(data);
    const ubl = generateUbl(data);
    const ciiReport = await validateInvoiceXml(cii, 'ok-cii.xml');
    const ublReport = await validateInvoiceXml(ubl, 'ok-ubl.xml');
    expect(ciiReport.wellFormed).toBe(true);
    expect(ciiReport.syntax).toBe('cii');
    expect(ciiReport.profile).toBe('XRECHNUNG');
    expect(ciiReport.xsd.ran).toBe(false);
    expect(ciiReport.schematron.ran).toBe(false);
    expect(failedIds(ciiReport), failedIds(ciiReport).join(',')).toEqual([]);
    expect(ciiReport.ok).toBe(true);
    expect(ublReport.syntax).toBe('ubl');
    expect(ublReport.ok).toBe(true);
  });

  it('flags wrong sum, missing Leitweg-ID, invalid IBAN', async () => {
    const cii = generateCii(sampleInvoice());
    const badSum = cii.replace(/<ram:TaxBasisTotalAmount>100.00<\/ram:TaxBasisTotalAmount>/, '<ram:TaxBasisTotalAmount>50.00</ram:TaxBasisTotalAmount>');
    const sumReport = await validateInvoiceXml(badSum);
    expect(failedIds(sumReport)).toContain('BR-CO-10');

    const noLeitweg = cii.replace(/<ram:BuyerReference>04011000-12345-26<\/ram:BuyerReference>/, '<ram:BuyerReference></ram:BuyerReference>');
    const leitwegReport = await validateInvoiceXml(noLeitweg);
    expect(failedIds(leitwegReport)).toEqual(expect.arrayContaining(['BR-DE-1', 'BT-10']));

    const badIban = cii.replace(sampleInvoice().seller.iban, 'DE00123456781234567890');
    const ibanReport = await validateInvoiceXml(badIban);
    expect(failedIds(ibanReport)).toContain('BR-IBAN-01');
  });

  it('PDF/A-3 Factur-X embed extracts identical XML', async () => {
    const data = sampleInvoice({ syntax: 'hybrid' });
    const cii = generateCii(data);
    const pdf = await generateInvoicePdf(data, cii, createToolContext().platform);
    const emb = await extractInvoiceXmlFromPdf(pdf);
    expect(emb?.name.toLowerCase()).toMatch(/factur-x|zugferd|xrechnung/);
    expect(emb?.xml.replace(/\s+/g, ' ').trim()).toBe(cii.replace(/\s+/g, ' ').trim());
    expect(emb?.afRelationship).toMatch(/Alternative|Data|Unspecified/);
  });

  it('validate tool emits JSON, Markdown, HTML, PDF view', async () => {
    const xml = generateCii(sampleInvoice());
    const result = await dachErechnungValidate.run(createToolContext(), [neoFileFromBytes('re.xml', new TextEncoder().encode(xml), MIME.xml)], { locale: 'de' });
    expect(result.outputs.map((o) => o.mime)).toEqual(expect.arrayContaining([MIME.json, MIME.md, MIME.html, MIME.pdf]));
  });

  it('generate tool + verify hook stay green', async () => {
    const data = sampleInvoice({ syntax: 'cii' });
    const result = await dachErechnungGenerate.run(createToolContext(), [], { ...data, autoVerify: true });
    const xml = result.outputs.find((o) => o.name.endsWith('-cii.xml'));
    expect(xml).toBeTruthy();
    const v = await dachErechnungGenerate.verify?.(createToolContext(), result.outputs, { ...data, autoVerify: true });
    expect(v?.passed).toBe(true);
  });
});
