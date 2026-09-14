import { compactIban, isValidIban } from './iban.js';

export interface GiroFields {
  bic?: string;
  name: string;
  iban: string;
  amount?: string;
  purpose?: string;
  reference?: string;
  unstructured?: string;
  hint?: string;
}

export function buildEpcPayload(fields: GiroFields): string {
  const iban = compactIban(fields.iban);
  if (!isValidIban(iban)) throw new Error(`Ungültige IBAN: ${fields.iban}`);
  if (!fields.name.trim()) throw new Error('Name fehlt.');
  let amount = '';
  if (fields.amount) {
    const n = Number(String(fields.amount).replace(',', '.').replace(/[^\d.]/g, ''));
    if (!Number.isFinite(n) || n < 0.01 || n > 999999999.99) throw new Error('Ungültiger Betrag.');
    amount = `EUR${n.toFixed(2)}`;
  }
  const ref = (fields.reference ?? '').trim();
  const unr = (fields.unstructured ?? '').trim();
  if (ref && unr) throw new Error('Referenz und Verwendungszweck dürfen nicht gleichzeitig gesetzt sein (EPC069-12).');
  const lines = [
    'BCD',
    '002',
    '1',
    'SCT',
    (fields.bic ?? '').trim(),
    fields.name.trim().slice(0, 70),
    iban,
    amount,
    (fields.purpose ?? '').trim().slice(0, 4),
    ref.slice(0, 35),
    unr.slice(0, 140),
    (fields.hint ?? '').trim().slice(0, 70),
  ];
  return lines.join('\n');
}

export function parseEpcPayload(text: string): GiroFields {
  const lines = text.replace(/\r/g, '').split('\n');
  if ((lines[0] ?? '').trim() !== 'BCD') throw new Error('Kein GiroCode (BCD).');
  return {
    bic: lines[4] || undefined,
    name: lines[5] ?? '',
    iban: lines[6] ?? '',
    amount: lines[7] || undefined,
    purpose: lines[8] || undefined,
    reference: lines[9] || undefined,
    unstructured: lines[10] || undefined,
    hint: lines[11] || undefined,
  };
}

export function parseGiroCsv(text: string): GiroFields[] {
  const rows: GiroFields[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return rows;
  const header = lines[0]!.split(/[;,]/).map((s) => s.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const start = header.includes('iban') || header.includes('name') ? 1 : 0;
  for (const line of lines.slice(start)) {
    const cols = line.split(/[;,]/);
    const get = (name: string, fallback: number) => {
      const i = idx(name);
      return (i >= 0 ? cols[i] : cols[fallback])?.trim() ?? '';
    };
    const name = get('name', 0);
    const iban = get('iban', 1);
    if (!name && !iban) continue;
    rows.push({
      name,
      iban,
      bic: get('bic', 2) || undefined,
      amount: get('amount', 3) || get('betrag', 3) || undefined,
      unstructured: get('purpose', 4) || get('verwendungszweck', 4) || undefined,
      reference: get('reference', 5) || get('referenz', 5) || undefined,
      hint: get('hint', 6) || get('hinweis', 6) || undefined,
    });
  }
  return rows;
}
