import { money } from '../util/money.js';
import { esc } from '../erechnung/xml.js';
import type { StatementParse } from './parse.js';

export function toCamt053(stmt: StatementParse, msgId = 'NT-CAMT-1'): string {
  const entries = stmt.entries
    .map((e, i) => {
      const cdt = e.amount >= 0 ? 'CRDT' : 'DBIT';
      return `      <Ntry>
        <NtryRef>${i + 1}</NtryRef>
        <Amt Ccy="EUR">${money(Math.abs(e.amount))}</Amt>
        <CdtDbtInd>${cdt}</CdtDbtInd>
        <BookgDt><Dt>${esc(normalizeDate(e.date))}</Dt></BookgDt>
        <ValDt><Dt>${esc(normalizeDate(e.valuta))}</Dt></ValDt>
        <NtryDtls><TxDtls><RmtInf><Ustrd>${esc(e.text)}</Ustrd></RmtInf></TxDtls></NtryDtls>
      </Ntry>`;
    })
    .join('\n');
  const start = stmt.startBalance ?? 0;
  const end = stmt.endBalance ?? start;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${new Date().toISOString()}</CreDtTm>
    </GrpHdr>
    <Stmt>
      <Id>${esc(msgId)}</Id>
      <Acct><Id><IBAN>${esc(stmt.iban)}</IBAN></Id></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">${money(Math.abs(start))}</Amt>
        <CdtDbtInd>${start >= 0 ? 'CRDT' : 'DBIT'}</CdtDbtInd>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">${money(Math.abs(end))}</Amt>
        <CdtDbtInd>${end >= 0 ? 'CRDT' : 'DBIT'}</CdtDbtInd>
      </Bal>
${entries}
    </Stmt>
  </BkToCstmrStmt>
</Document>
`;
}

export function toMt940(stmt: StatementParse, ref = 'NT940'): string {
  const start = stmt.startBalance ?? 0;
  const end = stmt.endBalance ?? start;
  const d0 = yyMMdd(stmt.entries[0]?.date ?? '01.01.2026');
  const d1 = yyMMdd(stmt.entries[stmt.entries.length - 1]?.date ?? d0);
  const lines = [
    `:20:${ref}`,
    `:25:${stmt.iban || 'DE00000000000000000000'}`,
    `:28C:1/1`,
    `:60F:${start >= 0 ? 'C' : 'D'}${d0}EUR${mtAmt(start)}`,
  ];
  for (const e of stmt.entries) {
    const mark = e.amount >= 0 ? 'C' : 'D';
    lines.push(`:61:${yyMMdd(e.date)}${yyMMdd(e.valuta).slice(4)}${mark}${mtAmt(e.amount)}NTRFNONREF`);
    lines.push(`:86:${e.text.slice(0, 65)}`);
  }
  lines.push(`:62F:${end >= 0 ? 'C' : 'D'}${d1}EUR${mtAmt(end)}`);
  return lines.join('\n') + '\n';
}

function normalizeDate(d: string): string {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(d);
  if (m) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${y}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return '1970-01-01';
}

function yyMMdd(d: string): string {
  const iso = normalizeDate(d);
  return iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
}

function mtAmt(n: number): string {
  return Math.abs(n).toFixed(2).replace('.', ',');
}
