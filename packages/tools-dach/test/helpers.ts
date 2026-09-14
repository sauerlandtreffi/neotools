import type { InvoiceData } from '../src/erechnung/invoice-data.js';

/** DE89 3704 0044 0532 0130 00 — valid IBAN. */
export const IBAN = 'DE89370400440532013000';

const SELLER = {
  name: 'Muster GmbH',
  street: 'Hauptstr. 1',
  zip: '10115',
  city: 'Berlin',
  country: 'DE',
  vatId: 'DE123456789',
  email: 're@muster.de',
  iban: IBAN,
  bic: 'COBADEFFXXX',
  leitwegId: '',
};

const BUYER = {
  name: 'Stadt Muster',
  street: 'Rathausplatz 1',
  zip: '20095',
  city: 'Hamburg',
  country: 'DE',
  vatId: 'DE987654321',
  email: '',
  iban: '',
  bic: '',
  leitwegId: '04011000-12345-26',
};

export function sampleInvoice(over: Partial<InvoiceData> = {}): InvoiceData {
  const { seller, buyer, ...rest } = over;
  return {
    profile: 'XRECHNUNG',
    syntax: 'both',
    invoiceNumber: 'RE-1001',
    issueDate: '2026-01-15',
    dueDate: '2026-01-29',
    deliveryDate: '2026-01-15',
    currency: 'EUR',
    typeCode: '380',
    taxMode: 'standard19',
    lines: [{ name: 'Beratung', qty: 1, unit: 'C62', net: 100, vatRate: 19 }],
    paymentTerms: 'Zahlbar innerhalb von 14 Tagen ohne Abzug.',
    skontoPercent: 0,
    skontoDays: 0,
    note: '',
    ...rest,
    seller: { ...SELLER, ...seller },
    buyer: { ...BUYER, ...buyer },
  };
}
