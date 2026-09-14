import { describe, expect, it } from 'vitest';
import { buildDatev, datevHeader, DATEV_COLUMNS } from '../src/receipts/datev.js';
import type { ReceiptFields } from '../src/receipts/extract.js';

const opts = {
  consultant: '10000',
  client: '20000',
  exportedBy: 'NeoTools',
  exportedAt: '2026-01-15',
  fiscalYear: '2026',
  dateFrom: '0101',
  dateTo: '1231',
  skr: 'SKR03' as const,
  account: '8400',
  contra: '1200',
  bu: '3',
};

describe('DATEV EXTF 700', () => {
  it('header snapshot (version 700, Buchungsstapel)', () => {
    expect(datevHeader(opts)).toMatchInlineSnapshot(
      `"EXTF;700;21;Buchungsstapel;9;20260115;20260115;NeoTools;;10000;20000;20260101;1;0101;1231;NeoTools Belege;;1;0;0;EUR;;;;;;SKR03"`,
    );
  });

  it('buildDatev writes header + Pflichtspalten + rows', () => {
    const rows: ReceiptFields[] = [
      {
        vendor: 'Bürobedarf GmbH',
        date: '15.01.2026',
        amount: 119.0,
        invoiceNumber: 'RE-9',
        iban: '',
        text: 'Papier',
      },
    ];
    const csv = buildDatev(rows, opts);
    const lines = csv.split(/\r?\n/).filter(Boolean);
    expect(lines[0]).toBe(datevHeader(opts));
    expect(lines[1]).toBe(DATEV_COLUMNS.join(';'));
    expect(lines[2]).toContain('119,00;S;EUR');
    expect(lines[2]).toContain('1501');
    expect(lines[2]).toContain('RE-9');
  });
});
