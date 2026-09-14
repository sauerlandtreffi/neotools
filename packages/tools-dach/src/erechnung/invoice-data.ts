import { z } from 'zod';
import { todayIso } from '../util/money.js';

export const partySchema = z.object({
  name: z.string().default(''),
  street: z.string().default(''),
  zip: z.string().default(''),
  city: z.string().default(''),
  country: z.string().default('DE'),
  vatId: z.string().default(''),
  email: z.string().default(''),
  iban: z.string().default(''),
  bic: z.string().default(''),
  leitwegId: z.string().default(''),
});

export const lineSchema = z.object({
  name: z.string().default('Leistung'),
  qty: z.coerce.number().default(1),
  unit: z.string().default('C62'),
  net: z.coerce.number().default(100),
  vatRate: z.coerce.number().default(19),
});

export const invoiceDataSchema = z.object({
  profile: z.enum(['MINIMUM', 'BASIC', 'EN16931', 'XRECHNUNG']).default('XRECHNUNG'),
  syntax: z.enum(['cii', 'ubl', 'both', 'hybrid']).default('hybrid'),
  invoiceNumber: z.string().default('RE-0001'),
  issueDate: z.string().default(''),
  dueDate: z.string().default(''),
  deliveryDate: z.string().default(''),
  currency: z.string().default('EUR'),
  typeCode: z.string().default('380'),
  taxMode: z.enum(['standard19', 'reduced7', 'zero', 'reverse13b', 'kleinunternehmer']).default('standard19'),
  seller: partySchema,
  buyer: partySchema,
  lines: z.array(lineSchema).default([{ name: 'Leistung', qty: 1, unit: 'C62', net: 100, vatRate: 19 }]),
  paymentTerms: z.string().default('Zahlbar innerhalb von 14 Tagen ohne Abzug.'),
  skontoPercent: z.coerce.number().default(0),
  skontoDays: z.coerce.number().default(0),
  note: z.string().default(''),
});

export type InvoiceData = z.infer<typeof invoiceDataSchema>;

export function taxModeMeta(mode: InvoiceData['taxMode']): { rate: number; category: string; exemption: string } {
  switch (mode) {
    case 'reduced7':
      return { rate: 7, category: 'S', exemption: '' };
    case 'zero':
      return { rate: 0, category: 'Z', exemption: 'Steuerfreie Lieferung' };
    case 'reverse13b':
      return { rate: 0, category: 'AE', exemption: 'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG)' };
    case 'kleinunternehmer':
      return { rate: 0, category: 'E', exemption: 'Kein Steuerausweis — Kleinunternehmer § 19 UStG' };
    default:
      return { rate: 19, category: 'S', exemption: '' };
  }
}

export function withDates(data: InvoiceData): InvoiceData {
  const issue = data.issueDate || todayIso();
  return { ...data, issueDate: issue, deliveryDate: data.deliveryDate || issue, dueDate: data.dueDate || issue };
}
