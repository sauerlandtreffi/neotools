import { isValidIban } from '../girocode/iban.js';
import { parseAmount } from '../util/money.js';

export interface ReceiptFields {
  vendor: string;
  date: string;
  amount: number;
  invoiceNumber: string;
  iban: string;
  text: string;
  page?: number;
}

const RE_DATE = /\b(\d{1,2}\.\d{1,2}\.\d{2,4})\b/;
const RE_INV = /(?:Rechnungs(?:nr\.?|nummer)|Beleg|RE)[:\s]*([A-Z0-9][A-Z0-9/._-]{2,})/i;

export function extractReceiptFields(text: string, page?: number): ReceiptFields {
  const dateM = RE_DATE.exec(text);
  const date = dateM?.[1] ?? '';
  const amounts = [...text.matchAll(/-?\d{1,3}(?:\.\d{3})*,\d{2}/g)].map((m) => parseAmount(m[0]!));
  const amount = amounts.length ? Math.max(...amounts.map(Math.abs)) : 0;
  let iban = '';
  for (const m of text.matchAll(/\b([A-Z]{2}\d{2}[A-Z0-9]{10,30})\b/g)) {
    if (isValidIban(m[1]!)) {
      iban = m[1]!;
      break;
    }
  }
  const vendor = text.split('\n').map((l) => l.trim()).find((l) => l.length > 3 && l.length < 60) ?? '';
  return {
    vendor,
    date,
    amount,
    invoiceNumber: RE_INV.exec(text)?.[1] ?? '',
    iban,
    text,
    page,
  };
}

export function receiptFilename(r: ReceiptFields, i: number): string {
  const d = r.date.replace(/\./g, '-') || 'datum';
  const v = (r.vendor || 'beleg').replace(/[^\w+-]+/g, '_').slice(0, 24);
  const a = r.amount ? r.amount.toFixed(2).replace('.', ',') : '0';
  return `${d}_${v}_${a}_${i + 1}.pdf`;
}
