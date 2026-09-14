import type { InvoiceProfile, InvoiceSyntax } from './types.js';

const GUIDELINES: Array<{ test: RegExp; profile: InvoiceProfile }> = [
  { test: /xrechnung|xeinkauf\.de:kosit/i, profile: 'XRECHNUNG' },
  { test: /extended/i, profile: 'EXTENDED' },
  { test: /en16931|en\s*16931|cen\.eu:en16931/i, profile: 'EN16931' },
  { test: /basic[_-]?wl|comfort/i, profile: 'BASIC_WL' },
  { test: /basic/i, profile: 'BASIC' },
  { test: /minimum/i, profile: 'MINIMUM' },
];

export function detectSyntax(rootLocal: string, namespaces: string[]): InvoiceSyntax {
  if (rootLocal === 'CrossIndustryInvoice' || namespaces.some((n) => /CrossIndustryInvoice/i.test(n))) {
    return 'cii';
  }
  if (rootLocal === 'Invoice' || rootLocal === 'CreditNote' || namespaces.some((n) => /oasis:names:specification:ubl/i.test(n))) {
    return 'ubl';
  }
  return 'unknown';
}

export function detectProfile(guidelineOrCustomization: string): InvoiceProfile {
  const raw = guidelineOrCustomization.trim();
  if (!raw) return 'UNKNOWN';
  for (const row of GUIDELINES) {
    if (row.test.test(raw)) return row.profile;
  }
  return 'UNKNOWN';
}

export function guidelineFor(profile: InvoiceProfile): string {
  switch (profile) {
    case 'XRECHNUNG':
      return 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';
    case 'EN16931':
      return 'urn:cen.eu:en16931:2017';
    case 'EXTENDED':
      return 'urn:factur-x.eu:1p0:extended';
    case 'BASIC_WL':
      return 'urn:factur-x.eu:1p0:basicwl';
    case 'BASIC':
      return 'urn:factur-x.eu:1p0:basic';
    case 'MINIMUM':
      return 'urn:factur-x.eu:1p0:minimum';
    default:
      return 'urn:cen.eu:en16931:2017';
  }
}

export function fxConformance(profile: InvoiceProfile): string {
  if (profile === 'XRECHNUNG' || profile === 'EN16931') return 'EN 16931';
  if (profile === 'BASIC_WL') return 'BASIC WL';
  if (profile === 'EXTENDED') return 'EXTENDED';
  if (profile === 'MINIMUM') return 'MINIMUM';
  return 'BASIC';
}

export function afRelationshipFor(profile: InvoiceProfile): 'Data' | 'Alternative' {
  if (profile === 'XRECHNUNG' || profile === 'EN16931' || profile === 'EXTENDED') return 'Alternative';
  return 'Data';
}
