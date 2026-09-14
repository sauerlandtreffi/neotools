export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function money(n: number): string {
  return round2(n).toFixed(2);
}

export function parseAmount(raw: string): number {
  const t = raw.replace(/\s/g, '').replace(/€/g, '');
  if (!t) return 0;
  if (/\d+\.\d{3},\d{2}$/.test(t) || (t.includes('.') && t.includes(','))) {
    return Number(t.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (t.includes(',') && !t.includes('.')) return Number(t.replace(',', '.')) || 0;
  return Number(t) || 0;
}

export function todayIso(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function compactDate(iso: string): string {
  return iso.replace(/-/g, '');
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function slug(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'file';
}
