import { extractInvoiceXmlFromPdf } from './extract-pdf.js';
import { trySchematron, tryXsd } from './optional-schema.js';
import { parseInvoiceXml } from './parse.js';
import { arithmeticFindings, businessRuleFindings, structuralBtFindings } from './rules.js';
import type { ParsedInvoice, ValidationReport } from './types.js';
import { emptyInvoice } from './types.js';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && PDF_MAGIC.every((b, i) => bytes[i] === b);
}

export async function loadInvoiceXml(
  bytes: Uint8Array,
  name: string,
): Promise<{ xml: string; invoice: ParsedInvoice; afRelationship?: string; embeddedName?: string; warning?: string }> {
  if (isPdf(bytes)) {
    const emb = await extractInvoiceXmlFromPdf(bytes);
    if (!emb) {
      return {
        xml: '',
        invoice: emptyInvoice(name),
        warning: 'Kein factur-x.xml / zugferd-invoice.xml / xrechnung.xml in den PDF/A-3-Anhängen.',
      };
    }
    const invoice = parseInvoiceXml(emb.xml, name);
    invoice.afRelationship = emb.afRelationship;
    invoice.embeddedName = emb.name;
    return { xml: emb.xml, invoice, afRelationship: emb.afRelationship, embeddedName: emb.name };
  }
  const xml = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return { xml, invoice: parseInvoiceXml(xml, name) };
}

export async function validateInvoiceXml(xml: string, sourceName = 'invoice.xml'): Promise<ValidationReport> {
  const invoice = parseInvoiceXml(xml, sourceName);
  const structural = invoice.wellFormed
    ? structuralBtFindings(invoice)
    : [
        {
          id: 'XML-WF',
          passed: false,
          severity: 'error' as const,
          message: { de: 'XML ist nicht wohlgeformt.', en: 'XML is not well-formed.' },
        },
      ];
  const business = invoice.wellFormed ? businessRuleFindings(invoice) : [];
  const arithmetic = invoice.wellFormed ? arithmeticFindings(invoice) : [];
  const xsd = await tryXsd(xml, invoice.syntax);
  const schematron = await trySchematron(xml);
  const failed = [...structural, ...business, ...arithmetic].filter((f) => !f.passed);
  return {
    ok: invoice.wellFormed && failed.length === 0,
    syntax: invoice.syntax,
    profile: invoice.profile,
    guidelineId: invoice.guidelineId,
    wellFormed: invoice.wellFormed,
    xsd: { ran: xsd.ran, ok: xsd.ok, detail: xsd.detail },
    schematron: { ran: schematron.ran, ok: schematron.ok, detail: schematron.detail, fired: schematron.fired },
    structural,
    business,
    arithmetic,
    invoice,
  };
}
