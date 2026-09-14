import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes } from '@neotools/engine';
import { DACH_LICENSES } from '../licenses.js';
import { pdfPageTexts, isPdfName } from '../pdf/text.js';
import { extractReceiptFields, type ReceiptFields } from '../receipts/extract.js';
import { buildDatev } from '../receipts/datev.js';
import { toCsv } from '../util/csv.js';
import { utf8 } from '../util/money.js';

const options = z.object({
  preset: z.enum(['datev', 'lexoffice', 'sevdesk', 'json', 'csv']).default('datev'),
  skr: z.enum(['SKR03', 'SKR04']).default('SKR03'),
  account: z.string().default('8400'),
  contra: z.string().default('1200'),
  bu: z.string().default(''),
  consultant: z.string().default('10000'),
  client: z.string().default('10000'),
  exportedAt: z.string().default('2026-01-15'),
  fiscalYear: z.string().default('2026'),
});

function lexoffice(rows: ReceiptFields[]): string {
  return toCsv(
    ['Date', 'Invoice number', 'Partner', 'Amount', 'Currency', 'Category'],
    rows.map((r) => ({
      Date: r.date,
      'Invoice number': r.invoiceNumber,
      Partner: r.vendor,
      Amount: r.amount,
      Currency: 'EUR',
      Category: 'Beleg',
    })),
  );
}

function sevdesk(rows: ReceiptFields[]): string {
  return toCsv(
    ['date', 'amount', 'description', 'invoiceNumber', 'account'],
    rows.map((r) => ({
      date: r.date,
      amount: r.amount,
      description: r.vendor,
      invoiceNumber: r.invoiceNumber,
      account: '8400',
    })),
    ';',
  );
}

export const dachReceiptExport = defineTool({
  id: 'dach-receipt-export',
  pack: 'dach',
  category: 'dach',
  title: { de: 'Belegdaten exportieren', en: 'Export receipt data' },
  description: {
    de: 'Belege → DATEV-Buchungsstapel (EXTF 700), Lexoffice-CSV, sevDesk-CSV oder JSON. Duplikate über Nummer+Betrag.',
    en: 'Receipts → DATEV posting batch (EXTF 700), Lexoffice CSV, sevDesk CSV or JSON. Duplicates via number+amount.',
  },
  inputs: { accept: [MIME.pdf, MIME.txt, MIME.json], multiple: true, min: 1 },
  outputs: { mime: ['text/plain', MIME.csv, MIME.json] },
  options,
  licenses: DACH_LICENSES,
  seo: { keywords: ['datev', 'lexoffice', 'sevdesk', 'belege'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const rows: ReceiptFields[] = [];
    const seen = new Set<string>();
    const dups: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      ctx.progress(i / files.length, file.name);
      let text = '';
      if (isPdfName(file.name, file.mime)) text = (await pdfPageTexts(await file.bytes())).join('\n');
      else text = new TextDecoder().decode(await file.bytes());
      const rec = extractReceiptFields(text);
      const key = `${rec.invoiceNumber}|${rec.amount}`;
      if (rec.invoiceNumber && seen.has(key)) {
        dups.push(file.name);
        continue;
      }
      if (rec.invoiceNumber) seen.add(key);
      rows.push(rec);
    }
    const datevOpts = {
      consultant: parsed.consultant,
      client: parsed.client,
      exportedBy: 'NeoTools',
      exportedAt: parsed.exportedAt,
      fiscalYear: parsed.fiscalYear,
      dateFrom: '0101',
      dateTo: '1231',
      skr: parsed.skr,
      account: parsed.account,
      contra: parsed.contra,
      bu: parsed.bu,
    };
    const outputs = [];
    if (parsed.preset === 'datev') {
      outputs.push(neoFileFromBytes('datev-buchungsstapel.csv', utf8(buildDatev(rows, datevOpts)), MIME.csv));
    } else if (parsed.preset === 'lexoffice') {
      outputs.push(neoFileFromBytes('lexoffice.csv', utf8(lexoffice(rows)), MIME.csv));
    } else if (parsed.preset === 'sevdesk') {
      outputs.push(neoFileFromBytes('sevdesk.csv', utf8(sevdesk(rows)), MIME.csv));
    } else if (parsed.preset === 'csv') {
      outputs.push(
        neoFileFromBytes(
          'belege.csv',
          utf8(toCsv(['vendor', 'date', 'amount', 'invoiceNumber', 'iban'], rows as unknown as Array<Record<string, unknown>>)),
          MIME.csv,
        ),
      );
    }
    outputs.push(neoFileFromBytes('belege.json', utf8(JSON.stringify({ rows, duplicates: dups }, null, 2)), MIME.json));
    return {
      outputs,
      warnings: dups.map((d) => `Duplikat übersprungen: ${d}`),
      report: attachProvenance({ count: rows.length, duplicates: dups }, await createProvenance('dach-receipt-export', parsed, files)),
    };
  },
});
