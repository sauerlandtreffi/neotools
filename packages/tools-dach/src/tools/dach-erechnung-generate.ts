import { z } from 'zod';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  neoFileFromBytes,
  type VerificationReport,
} from '@neotools/engine';
import { DACH_LICENSES } from '../licenses.js';
import { invoiceDataSchema, withDates, type InvoiceData } from '../erechnung/invoice-data.js';
import { generateCii } from '../erechnung/generate-cii.js';
import { generateUbl } from '../erechnung/generate-ubl.js';
import { generateInvoicePdf } from '../erechnung/generate-pdf.js';
import { validateInvoiceXml } from '../erechnung/validate.js';
import { parseCsv } from '../util/csv.js';
import { utf8 } from '../util/money.js';

const options = invoiceDataSchema.extend({
  autoVerify: z.boolean().default(true),
});

function parseInvoiceJson(text: string): InvoiceData[] {
  const raw = JSON.parse(text) as unknown;
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((row) => invoiceDataSchema.parse(row));
}

export const dachErechnungGenerate = defineTool({
  id: 'dach-erechnung-generate',
  pack: 'dach',
  category: 'dach',
  title: { de: 'E-Rechnung erzeugen', en: 'Generate e-invoice' },
  description: {
    de: 'CII/UBL und optionales PDF/A-3b (Factur-X) aus Formular, JSON oder CSV. Anschließend Validierung.',
    en: 'CII/UBL and optional PDF/A-3b (Factur-X) from form, JSON or CSV, then validate.',
  },
  inputs: {
    accept: [MIME.json, MIME.csv, 'text/csv', 'text/plain', MIME.png, MIME.jpeg, 'image/jpg'],
    multiple: true,
    min: 0,
  },
  outputs: { mime: [MIME.xml, MIME.pdf, MIME.json] },
  options,
  licenses: DACH_LICENSES,
  seo: { keywords: ['xrechnung erzeugen', 'zugferd', 'factur-x'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const jobs: InvoiceData[] = [];
    let logo: Uint8Array | undefined;
    for (const file of files) {
      const bytes = await file.bytes();
      if (/\.(png|jpe?g)$/i.test(file.name)) {
        logo = bytes;
        continue;
      }
      const text = new TextDecoder().decode(bytes);
      if (/\.json$/i.test(file.name) || file.mime === MIME.json) jobs.push(...parseInvoiceJson(text));
      else if (/\.csv$/i.test(file.name) || file.mime === MIME.csv || file.mime === 'text/plain') {
        for (const row of parseCsv(text)) {
          jobs.push(
            invoiceDataSchema.parse({
              ...parsed,
              invoiceNumber: row.invoiceNumber || row.nummer || parsed.invoiceNumber,
              seller: { ...parsed.seller, name: row.seller || parsed.seller.name, iban: row.iban || parsed.seller.iban },
              buyer: { ...parsed.buyer, name: row.buyer || parsed.buyer.name, leitwegId: row.leitwegId || parsed.buyer.leitwegId },
              lines: [{ name: row.name || 'Position', qty: Number(row.qty || 1), unit: 'C62', net: Number(row.net || 0), vatRate: Number(row.vatRate || 19) }],
            }),
          );
        }
      }
    }
    if (!jobs.length) jobs.push(withDates(parsed));
    const outputs: ReturnType<typeof neoFileFromBytes>[] = [];
    const reports = [];
    for (let i = 0; i < jobs.length; i++) {
      ctx.progress(i / jobs.length, jobs[i]!.invoiceNumber);
      const job = withDates(jobs[i]!);
      const cii = generateCii(job);
      const ubl = generateUbl(job);
      const stem = job.invoiceNumber.replace(/[^\w.-]+/g, '_') || `invoice-${i + 1}`;
      if (job.syntax === 'cii' || job.syntax === 'both' || job.syntax === 'hybrid') {
        outputs.push(neoFileFromBytes(`${stem}-cii.xml`, utf8(cii), MIME.xml));
      }
      if (job.syntax === 'ubl' || job.syntax === 'both') {
        outputs.push(neoFileFromBytes(`${stem}-ubl.xml`, utf8(ubl), MIME.xml));
      }
      if (job.syntax === 'hybrid') {
        const pdf = await generateInvoicePdf(job, cii, ctx.platform, logo);
        outputs.push(neoFileFromBytes(`${stem}-factur-x.pdf`, pdf, MIME.pdf));
      }
      const report = await validateInvoiceXml(cii, `${stem}-cii.xml`);
      reports.push(report);
      outputs.push(neoFileFromBytes(`${stem}-validate.json`, utf8(JSON.stringify(report, null, 2)), MIME.json));
    }
    return {
      outputs,
      warnings: reports.filter((r) => !r.ok).map((r) => `${r.invoice.invoiceNumber}: Validierung mit Befunden`),
      report: attachProvenance({ count: jobs.length, ok: reports.every((r) => r.ok) }, await createProvenance('dach-erechnung-generate', parsed, files)),
    };
  },
  async verify(_ctx, outputs): Promise<VerificationReport> {
    const xmls = outputs.filter((o) => o.mime === MIME.xml || o.name.endsWith('.xml'));
    const checks = [];
    for (const file of xmls) {
      const report = await validateInvoiceXml(new TextDecoder().decode(await file.bytes()), file.name);
      checks.push({ id: file.name, passed: report.ok, detail: report.ok ? 'BR/BT ok' : 'siehe Report' });
    }
    if (!checks.length) checks.push({ id: 'no-xml', passed: true, detail: 'kein XML-Output' });
    return { passed: checks.every((c) => c.passed), checks };
  },
});
