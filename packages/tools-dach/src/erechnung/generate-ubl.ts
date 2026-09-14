import { money, round2 } from '../util/money.js';
import { taxModeMeta, withDates, type InvoiceData } from './invoice-data.js';
import { guidelineFor } from './profiles.js';
import { esc } from './xml.js';

export function generateUbl(raw: InvoiceData): string {
  const data = withDates(raw);
  const meta = taxModeMeta(data.taxMode);
  const lines = data.lines.map((l) => ({
    ...l,
    vatRate: data.taxMode === 'standard19' || data.taxMode === 'reduced7' ? l.vatRate || meta.rate : meta.rate,
  }));
  const net = round2(lines.reduce((s, l) => s + l.net, 0));
  const byRate = new Map<number, number>();
  for (const l of lines) byRate.set(l.vatRate, round2((byRate.get(l.vatRate) ?? 0) + l.net));
  let tax = 0;
  const sub: string[] = [];
  for (const [rate, base] of byRate) {
    const amount = round2((base * rate) / 100);
    tax = round2(tax + amount);
    sub.push(`    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${esc(data.currency)}">${money(base)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${esc(data.currency)}">${money(amount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${meta.category}</cbc:ID>
        <cbc:Percent>${money(rate)}</cbc:Percent>
        <cbc:TaxExemptionReason>${esc(meta.exemption)}</cbc:TaxExemptionReason>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`);
  }
  const gross = round2(net + tax);
  const lineXml = lines
    .map(
      (l, i) => `  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${esc(l.unit)}">${l.qty}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${esc(data.currency)}">${money(l.net)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(l.name)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${meta.category}</cbc:ID>
        <cbc:Percent>${money(l.vatRate)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${esc(data.currency)}">${money(l.qty ? l.net / l.qty : l.net)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>${esc(guidelineFor(data.profile))}</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(data.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${esc(data.issueDate.slice(0, 10))}</cbc:IssueDate>
  <cbc:DueDate>${esc(data.dueDate.slice(0, 10))}</cbc:DueDate>
  <cbc:InvoiceTypeCode>${esc(data.typeCode)}</cbc:InvoiceTypeCode>
  <cbc:Note>${esc(data.note)}</cbc:Note>
  <cbc:DocumentCurrencyCode>${esc(data.currency)}</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>${esc(data.buyer.leitwegId)}</cbc:BuyerReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${esc(data.seller.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(data.seller.street)}</cbc:StreetName>
        <cbc:CityName>${esc(data.seller.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(data.seller.zip)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${esc(data.seller.country)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(data.seller.vatId)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:Contact><cbc:ElectronicMail>${esc(data.seller.email)}</cbc:ElectronicMail></cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${esc(data.buyer.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(data.buyer.street)}</cbc:StreetName>
        <cbc:CityName>${esc(data.buyer.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(data.buyer.zip)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${esc(data.buyer.country)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:Delivery>
    <cbc:ActualDeliveryDate>${esc(data.deliveryDate.slice(0, 10))}</cbc:ActualDeliveryDate>
  </cac:Delivery>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${esc(data.seller.iban.replace(/\s/g, ''))}</cbc:ID>
      <cac:FinancialInstitutionBranch><cbc:ID>${esc(data.seller.bic)}</cbc:ID></cac:FinancialInstitutionBranch>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:PaymentTerms><cbc:Note>${esc(data.paymentTerms)}</cbc:Note></cac:PaymentTerms>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${esc(data.currency)}">${money(tax)}</cbc:TaxAmount>
${sub.join('\n')}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${esc(data.currency)}">${money(net)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${esc(data.currency)}">${money(net)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${esc(data.currency)}">${money(gross)}</cbc:TaxInclusiveAmount>
    <cbc:PrepaidAmount currencyID="${esc(data.currency)}">0.00</cbc:PrepaidAmount>
    <cbc:PayableAmount currencyID="${esc(data.currency)}">${money(gross)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lineXml}
</Invoice>
`;
}
