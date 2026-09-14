export type InvoiceSyntax = 'cii' | 'ubl' | 'unknown';

export type InvoiceProfile =
  | 'MINIMUM'
  | 'BASIC_WL'
  | 'BASIC'
  | 'EN16931'
  | 'EXTENDED'
  | 'XRECHNUNG'
  | 'UNKNOWN';

export interface InvoiceParty {
  name: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  vatId: string;
  email: string;
  iban: string;
  bic: string;
  leitwegId: string;
}

export interface InvoiceLine {
  id: string;
  name: string;
  qty: number;
  unit: string;
  net: number;
  vatRate: number;
  vatCategory: string;
}

export interface TaxBreak {
  category: string;
  rate: number;
  base: number;
  amount: number;
}

export interface ParsedInvoice {
  syntax: InvoiceSyntax;
  profile: InvoiceProfile;
  guidelineId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  deliveryDate: string;
  typeCode: string;
  currency: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  lines: InvoiceLine[];
  netTotal: number;
  taxTotal: number;
  grossTotal: number;
  prepaid: number;
  payable: number;
  taxBreakdown: TaxBreak[];
  paymentMeans: string;
  paymentTerms: string;
  iban: string;
  bic: string;
  note: string;
  namespaces: string[];
  wellFormed: boolean;
  sourceName: string;
  afRelationship?: string;
  embeddedName?: string;
}

export interface RuleFinding {
  id: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  message: { de: string; en: string };
  path?: string;
}

export interface ValidationReport {
  ok: boolean;
  syntax: InvoiceSyntax;
  profile: InvoiceProfile;
  guidelineId: string;
  wellFormed: boolean;
  xsd: { ran: boolean; ok?: boolean; detail: string };
  schematron: { ran: boolean; ok?: boolean; detail: string; fired: number };
  structural: RuleFinding[];
  business: RuleFinding[];
  arithmetic: RuleFinding[];
  invoice: ParsedInvoice;
}

export function emptyParty(): InvoiceParty {
  return {
    name: '',
    street: '',
    zip: '',
    city: '',
    country: 'DE',
    vatId: '',
    email: '',
    iban: '',
    bic: '',
    leitwegId: '',
  };
}

export function emptyInvoice(sourceName = ''): ParsedInvoice {
  return {
    syntax: 'unknown',
    profile: 'UNKNOWN',
    guidelineId: '',
    invoiceNumber: '',
    issueDate: '',
    dueDate: '',
    deliveryDate: '',
    typeCode: '',
    currency: 'EUR',
    seller: emptyParty(),
    buyer: emptyParty(),
    lines: [],
    netTotal: 0,
    taxTotal: 0,
    grossTotal: 0,
    prepaid: 0,
    payable: 0,
    taxBreakdown: [],
    paymentMeans: '',
    paymentTerms: '',
    iban: '',
    bic: '',
    note: '',
    namespaces: [],
    wellFormed: false,
    sourceName,
  };
}
