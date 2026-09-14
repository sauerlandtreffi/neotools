import { describe, expect, it } from 'vitest';
import { parseStatement } from '../src/statement/parse.js';
import { toCamt053, toMt940 } from '../src/statement/camt.js';

const SAMPLE = `Kontoauszug Sparkasse
IBAN DE89370400440532013000
Anfangssaldo 1.000,00
02.01.2026 02.01.2026 Miete Wohnung -500,00
03.01.2026 03.01.2026 Gehalt Januar 1.200,00
Endsaldo 1.700,00
`;

describe('CAMT.053 / MT940', () => {
  it('parses Sparkasse lines and checks balances', () => {
    const stmt = parseStatement(SAMPLE, 'sparkasse');
    expect(stmt.entries).toHaveLength(2);
    expect(stmt.startBalance).toBe(1000);
    expect(stmt.endBalance).toBe(1700);
    expect(stmt.sum).toBe(700);
    expect(stmt.balanceOk).toBe(true);
    expect(stmt.iban).toBe('DE89370400440532013000');
  });

  it('emits CAMT.053 ISO 20022 minimal structure', () => {
    const xml = toCamt053(parseStatement(SAMPLE, 'sparkasse'));
    expect(xml).toContain('xmlns="urn:iso:20022:tech:xsd:camt.053.001.02"');
    expect(xml).toContain('<BkToCstmrStmt>');
    expect(xml).toContain('<Cd>OPBD</Cd>');
    expect(xml).toContain('<Cd>CLBD</Cd>');
    expect(xml).toContain('<CdtDbtInd>DBIT</CdtDbtInd>');
    expect(xml).toContain('<CdtDbtInd>CRDT</CdtDbtInd>');
    expect(xml).toContain('<Ntry>');
  });

  it('emits MT940 with 20/25/60F/61/62F', () => {
    const mt = toMt940(parseStatement(SAMPLE, 'sparkasse'));
    expect(mt).toMatch(/^:20:/m);
    expect(mt).toMatch(/^:25:DE89370400440532013000/m);
    expect(mt).toMatch(/^:60F:C/m);
    expect(mt).toMatch(/^:61:/m);
    expect(mt).toMatch(/^:62F:C/m);
  });
});
