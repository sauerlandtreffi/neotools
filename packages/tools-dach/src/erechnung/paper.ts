import { isValidIban } from '../girocode/iban.js';
import { parseAmount, todayIso } from '../util/money.js';
import { invoiceDataSchema, type InvoiceData } from './invoice-data.js';

export interface FieldHit<T> {
  value: T;
  confidence: number;
  evidence: string;
}

export interface PaperExtract {
  data: InvoiceData;
  confidence: Record<string, number>;
  checklist: string[];
  meanConfidence: number;
}

const RE_INV = /(?:Rechnungs(?:nr\.?|nummer)|Invoice\s*(?:No\.?|number)|Beleg(?:nr)?|RE)[:\s]*([A-Z0-9][A-Z0-9/._-]{2,})/i;
const RE_DATE = /\b(\d{1,2}\.\d{1,2}\.\d{2,4}|\d{4}-\d{2}-\d{2})\b/g;
const RE_IBAN = /\b([A-Z]{2}\d{2}[A-Z0-9]{10,30})\b/g;
const RE_VAT = /\b((?:DE)?\d{9}|[A-Z]{2}[A-Z0-9]{8,12})\b/g;
const RE_AMT = /(?:Netto|MwSt|USt|Steuer|Brutto|Gesamt|Summe)[:\s]*(-?\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/gi;
const RE_RATE = /(?:19|7|0)\s*%/;

function toIso(d: string): string {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(d);
  if (m) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${y}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  }
  return d;
}

function first(re: RegExp, text: string): string {
  const m = re.exec(text);
  return m?.[1] ?? '';
}

export function extractInvoiceFields(text: string): PaperExtract {
  const confidence: Record<string, number> = {};
  const invoiceNumber = first(RE_INV, text);
  confidence.invoiceNumber = invoiceNumber ? 0.85 : 0.2;
  const dates = [...text.matchAll(RE_DATE)].map((m) => toIso(m[1]!));
  const issueDate = dates[0] || todayIso();
  confidence.issueDate = dates[0] ? 0.75 : 0.2;
  const deliveryDate = dates[1] || issueDate;
  const dueDate = dates[2] || issueDate;
  let iban = '';
  for (const m of text.matchAll(RE_IBAN)) {
    if (isValidIban(m[1]!)) {
      iban = m[1]!;
      break;
    }
  }
  confidence.iban = iban ? 0.95 : 0.15;
  const vatHits = [...text.matchAll(RE_VAT)].map((m) => m[1]!).filter((v) => /DE\d{9}|[A-Z]{2}[A-Z0-9]{8,12}/.test(v));
  const sellerVat = vatHits[0] ?? '';
  confidence.vatId = sellerVat ? 0.7 : 0.2;
  const amounts: Record<string, number> = {};
  for (const m of text.matchAll(RE_AMT)) {
    const label = m[0].toLowerCase();
    const n = parseAmount(m[1] ?? '');
    if (label.includes('netto')) amounts.net = n;
    else if (label.includes('brutto') || label.includes('gesamt')) amounts.gross = n;
    else if (label.includes('mwst') || label.includes('ust') || label.includes('steuer')) amounts.tax = n;
  }
  const rate = RE_RATE.exec(text)?.[0]?.includes('7') ? 7 : text.includes('§ 19') ? 0 : 19;
  const net = amounts.net || (amounts.gross && amounts.tax ? amounts.gross - amounts.tax : amounts.gross ? amounts.gross / (1 + rate / 100) : 0);
  confidence.net = amounts.net ? 0.85 : net ? 0.45 : 0.15;
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => /\d+[.,]\d{2}/.test(l) && l.length > 6 && !/^(netto|brutto|mwst|ust|summe)/i.test(l));
  const pos = lines.slice(0, 12).map((l) => {
    const amt = parseAmount((/\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2}/.exec(l) ?? ['0'])[0]!);
    const name = l.replace(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2}/, '').replace(/\s{2,}/g, ' ').trim().slice(0, 80);
    return { name: name || 'Position', qty: 1, unit: 'C62', net: amt || net, vatRate: rate };
  });
  const header = text.split('\n').slice(0, 12).join(' ');
  const sellerName = header.split(/\n|,/)[0]?.slice(0, 80) || '';
  const data = invoiceDataSchema.parse({
    invoiceNumber: invoiceNumber || 'RE-UNBEKANNT',
    issueDate,
    dueDate,
    deliveryDate,
    seller: { name: sellerName, vatId: sellerVat, iban, country: 'DE' },
    buyer: { name: '', country: 'DE', leitwegId: '' },
    lines: pos.length ? pos : [{ name: 'Leistung (bitte prüfen)', qty: 1, unit: 'C62', net: net || 0, vatRate: rate }],
    taxMode: rate === 7 ? 'reduced7' : rate === 0 ? 'zero' : 'standard19',
  });
  const vals = Object.values(confidence);
  const meanConfidence = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const checklist = [
    'Rechnungsnummer und Datum bestätigen',
    'Verkäufer / Käufer / Leitweg-ID prüfen',
    'Positionen und Steuersatz kontrollieren',
    'IBAN-Prüfsumme und Zahlungsziel prüfen',
    'Erst danach dach-erechnung-generate ausführen',
  ];
  return { data, confidence, checklist, meanConfidence };
}
