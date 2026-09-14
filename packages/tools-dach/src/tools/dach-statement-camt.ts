import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes } from '@neotools/engine';
import { DACH_LICENSES } from '../licenses.js';
import { pdfPageTexts, isPdfName } from '../pdf/text.js';
import { parseStatement } from '../statement/parse.js';
import { toCamt053, toMt940 } from '../statement/camt.js';
import { BANK_RULES } from '../statement/banks.js';
import { toCsv } from '../util/csv.js';
import { utf8 } from '../util/money.js';

const options = z.object({
  bank: z.enum(['sparkasse', 'volksbank', 'deutsche-bank', 'commerzbank', 'ing', 'dkb', 'comdirect', 'n26', 'postbank']).default('sparkasse'),
  format: z.enum(['all', 'csv', 'json', 'camt', 'mt940']).default('all'),
});

export const dachStatementCamt = defineTool({
  id: 'dach-statement-camt',
  pack: 'dach',
  category: 'dach',
  title: { de: 'Kontoauszug → CAMT/MT940', en: 'Statement → CAMT/MT940' },
  description: {
    de: 'Kontoauszug-PDF zeilenweise clustern (Bank-Presets), Saldenprüfung, CSV/JSON/CAMT.053/MT940.',
    en: 'Cluster statement PDF lines (bank presets), check balances, emit CSV/JSON/CAMT.053/MT940.',
  },
  inputs: { accept: [MIME.pdf, MIME.txt], multiple: false, min: 1 },
  outputs: { mime: [MIME.csv, MIME.json, MIME.xml, 'text/plain'] },
  options,
  presets: BANK_RULES.map((b) => ({ id: b.id, title: { de: b.name, en: b.name }, options: { bank: b.id as never } })),
  licenses: DACH_LICENSES,
  seo: { keywords: ['kontoauszug', 'camt.053', 'mt940'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const file = files[0]!;
    ctx.progress(0.2, file.name);
    const text = isPdfName(file.name, file.mime)
      ? (await pdfPageTexts(await file.bytes())).join('\n')
      : new TextDecoder().decode(await file.bytes());
    const stmt = parseStatement(text, parsed.bank);
    const outputs = [];
    if (parsed.format === 'all' || parsed.format === 'json') {
      outputs.push(neoFileFromBytes('statement.json', utf8(JSON.stringify(stmt, null, 2)), MIME.json));
    }
    if (parsed.format === 'all' || parsed.format === 'csv') {
      outputs.push(
        neoFileFromBytes(
          'statement.csv',
          utf8(toCsv(['date', 'valuta', 'text', 'amount'], stmt.entries as unknown as Array<Record<string, unknown>>)),
          MIME.csv,
        ),
      );
    }
    if (parsed.format === 'all' || parsed.format === 'camt') {
      outputs.push(neoFileFromBytes('statement.camt053.xml', utf8(toCamt053(stmt)), MIME.xml));
    }
    if (parsed.format === 'all' || parsed.format === 'mt940') {
      outputs.push(neoFileFromBytes('statement.mt940.txt', utf8(toMt940(stmt)), 'text/plain'));
    }
    const warnings = [];
    if (stmt.balanceOk === false) warnings.push('Saldenprüfung fehlgeschlagen (Anfangs+Summe ≠ Ende).');
    return {
      outputs,
      warnings,
      report: attachProvenance({ bank: stmt.bank, entries: stmt.entries.length, balanceOk: stmt.balanceOk }, await createProvenance('dach-statement-camt', parsed, files)),
    };
  },
});
