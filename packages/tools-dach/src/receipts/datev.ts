import type { ReceiptFields } from './extract.js';

/** DATEV Buchungsstapel EXTF version 700 — 21 = Buchungsstapel, format version 9. */
export interface DatevOptions {
  consultant: string;
  client: string;
  exportedBy: string;
  exportedAt: string;
  fiscalYear: string;
  dateFrom: string;
  dateTo: string;
  skr: 'SKR03' | 'SKR04';
  account: string;
  contra: string;
  bu: string;
}

export const DATEV_COLUMNS = [
  'Umsatz (ohne Soll/Haben-Kz)',
  'Soll/Haben-Kennzeichen',
  'WKZ Umsatz',
  'Kurs',
  'Basis-Umsatz',
  'WKZ Basis-Umsatz',
  'Konto',
  'Gegenkonto (ohne BU-Schlüssel)',
  'BU-Schlüssel',
  'Belegdatum',
  'Belegfeld 1',
  'Belegfeld 2',
  'Skonto',
  'Buchungstext',
] as const;

function ymd(iso: string): string {
  return iso.replace(/-/g, '').slice(0, 8);
}

function belegdatum(de: string): string {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/.exec(de);
  if (!m) return '0101';
  return `${m[1]!.padStart(2, '0')}${m[2]!.padStart(2, '0')}`;
}

export function datevHeader(opts: DatevOptions): string {
  const fields = [
    'EXTF',
    '700',
    '21',
    'Buchungsstapel',
    '9',
    ymd(opts.exportedAt),
    ymd(opts.exportedAt),
    opts.exportedBy,
    '',
    opts.consultant,
    opts.client,
    `${opts.fiscalYear}0101`,
    '1',
    opts.dateFrom,
    opts.dateTo,
    'NeoTools Belege',
    '',
    '1',
    '0',
    '0',
    'EUR',
    '',
    '',
    '',
    '',
    '',
    opts.skr,
  ];
  return fields.join(';');
}

export function datevRow(r: ReceiptFields, opts: DatevOptions): string {
  const umsatz = Math.abs(r.amount).toFixed(2).replace('.', ',');
  const sh = r.amount < 0 ? 'H' : 'S';
  const cells = [
    umsatz,
    sh,
    'EUR',
    '',
    '',
    '',
    opts.account,
    opts.contra,
    opts.bu,
    belegdatum(r.date),
    r.invoiceNumber,
    '',
    '',
    (r.vendor || r.text).slice(0, 60).replace(/;/g, ','),
  ];
  return cells.join(';');
}

export function buildDatev(rows: ReceiptFields[], opts: DatevOptions): string {
  return [datevHeader(opts), DATEV_COLUMNS.join(';'), ...rows.map((r) => datevRow(r, opts))].join('\r\n') + '\r\n';
}
