/** IBAN mod-97 (same algorithm as tools-pdf redact patterns). */
export function ibanMod97(iban: string): number {
  const compact = iban.replace(/[\s-]+/g, '').toUpperCase();
  const rearr = compact.slice(4) + compact.slice(0, 4);
  let expanded = '';
  for (const ch of rearr) {
    const code = ch.charCodeAt(0);
    expanded += code >= 65 && code <= 90 ? String(code - 55) : ch;
  }
  let rest = 0;
  for (const ch of expanded) rest = (rest * 10 + (ch.charCodeAt(0) - 48)) % 97;
  return rest;
}

export function isValidIban(iban: string): boolean {
  const compact = iban.replace(/[\s-]+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(compact)) return false;
  if (compact.startsWith('DE') && compact.length !== 22) return false;
  return ibanMod97(compact) === 1;
}

export function compactIban(iban: string): string {
  return iban.replace(/[\s-]+/g, '').toUpperCase();
}
