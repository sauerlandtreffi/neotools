import { parseAmount } from '../util/money.js';
import { detectProfile, detectSyntax } from './profiles.js';
import {
  emptyInvoice,
  emptyParty,
  type InvoiceLine,
  type InvoiceParty,
  type ParsedInvoice,
} from './types.js';
import { childText, collectNamespaces, findAll, findFirst, parseXml, textOf, type XmlNode } from './xml.js';

function num(s: string): number {
  return parseAmount(s);
}

function partyFromCii(trade: XmlNode | undefined, role: 'seller' | 'buyer'): InvoiceParty {
  const p = emptyParty();
  if (!trade) return p;
  const party = findFirst(trade, role === 'seller' ? 'SellerTradeParty' : 'BuyerTradeParty');
  if (!party) return p;
  p.name = childText(party, 'Name');
  const addr = findFirst(party, 'PostalTradeAddress');
  p.street = childText(addr, 'LineOne');
  p.zip = childText(addr, 'PostcodeCode');
  p.city = childText(addr, 'CityName');
  p.country = childText(addr, 'CountryID') || 'DE';
  const tax = findFirst(party, 'SpecifiedTaxRegistration');
  p.vatId = childText(tax, 'ID');
  p.email = childText(findFirst(party, 'URIUniversalCommunication'), 'URIID');
  return p;
}

function partyFromUbl(root: XmlNode, role: 'seller' | 'buyer'): InvoiceParty {
  const p = emptyParty();
  const party = findFirst(root, role === 'seller' ? 'AccountingSupplierParty' : 'AccountingCustomerParty');
  if (!party) return p;
  p.name = childText(findFirst(party, 'PartyName'), 'Name') || childText(findFirst(party, 'PartyLegalEntity'), 'RegistrationName');
  const addr = findFirst(party, 'PostalAddress');
  p.street = childText(addr, 'StreetName');
  p.zip = childText(addr, 'PostalZone');
  p.city = childText(addr, 'CityName');
  p.country = childText(findFirst(addr, 'Country'), 'IdentificationCode') || 'DE';
  p.vatId = childText(findFirst(party, 'PartyTaxScheme'), 'CompanyID');
  p.email = childText(findFirst(party, 'Contact'), 'ElectronicMail');
  return p;
}

function ciiLines(root: XmlNode): InvoiceLine[] {
  return findAll(root, 'IncludedSupplyChainTradeLineItem').map((item, i) => {
    const prod = findFirst(item, 'SpecifiedTradeProduct');
    const del = findFirst(item, 'SpecifiedLineTradeDelivery');
    const set = findFirst(item, 'SpecifiedLineTradeSettlement');
    const tax = findFirst(set, 'ApplicableTradeTax');
    const qty = num(childText(del, 'BilledQuantity')) || 1;
    const net = num(childText(findFirst(set, 'SpecifiedTradeSettlementLineMonetarySummation'), 'LineTotalAmount'));
    return {
      id: childText(findFirst(item, 'AssociatedDocumentLineDocument'), 'LineID') || String(i + 1),
      name: childText(prod, 'Name') || childText(prod, 'SellerAssignedID'),
      qty,
      unit: findFirst(del, 'BilledQuantity')?.attrs.unitCode || 'C62',
      net,
      vatRate: num(childText(tax, 'RateApplicablePercent')),
      vatCategory: childText(tax, 'CategoryCode') || 'S',
    };
  });
}

function ublLines(root: XmlNode): InvoiceLine[] {
  return findAll(root, 'InvoiceLine').map((item, i) => {
    const tax = findFirst(item, 'ClassifiedTaxCategory') ?? findFirst(item, 'TaxCategory');
    return {
      id: childText(item, 'ID') || String(i + 1),
      name: childText(findFirst(item, 'Item'), 'Name'),
      qty: num(childText(item, 'InvoicedQuantity')) || 1,
      unit: findFirst(item, 'InvoicedQuantity')?.attrs.unitCode || 'C62',
      net: num(childText(item, 'LineExtensionAmount')),
      vatRate: num(childText(tax, 'Percent')),
      vatCategory: childText(tax, 'ID') || 'S',
    };
  });
}

export function parseInvoiceXml(xml: string, sourceName = 'invoice.xml'): ParsedInvoice {
  const inv = emptyInvoice(sourceName);
  let root: XmlNode;
  try {
    root = parseXml(xml);
    inv.wellFormed = true;
  } catch {
    inv.wellFormed = false;
    return inv;
  }
  inv.namespaces = collectNamespaces(xml);
  inv.syntax = detectSyntax(root.name, inv.namespaces);
  if (inv.syntax === 'cii') {
    inv.guidelineId = childText(findFirst(root, 'GuidelineSpecifiedDocumentContextParameter'), 'ID');
    inv.profile = detectProfile(inv.guidelineId);
    inv.invoiceNumber = childText(findFirst(root, 'ExchangedDocument'), 'ID');
    inv.issueDate = childText(findFirst(findFirst(root, 'ExchangedDocument'), 'IssueDateTime'), 'DateTimeString');
    inv.typeCode = childText(findFirst(root, 'ExchangedDocument'), 'TypeCode');
    const settle = findFirst(root, 'ApplicableHeaderTradeSettlement');
    inv.currency = childText(settle, 'InvoiceCurrencyCode') || 'EUR';
    inv.dueDate = childText(findFirst(settle, 'SpecifiedTradePaymentTerms'), 'DueDateDateTime') || childText(findFirst(settle, 'DueDateDateTime'), 'DateTimeString');
    inv.paymentTerms = childText(findFirst(settle, 'SpecifiedTradePaymentTerms'), 'Description');
    inv.iban = childText(findFirst(settle, 'PayeePartyCreditorFinancialAccount'), 'IBANID');
    inv.bic = childText(findFirst(settle, 'PayeeSpecifiedCreditorFinancialInstitution'), 'BICID');
    inv.paymentMeans = childText(findFirst(settle, 'SpecifiedTradeSettlementPaymentMeans'), 'TypeCode');
    const sum = findFirst(settle, 'SpecifiedTradeSettlementHeaderMonetarySummation');
    inv.netTotal = num(childText(sum, 'TaxBasisTotalAmount'));
    inv.taxTotal = num(childText(sum, 'TaxTotalAmount'));
    inv.grossTotal = num(childText(sum, 'GrandTotalAmount'));
    inv.prepaid = num(childText(sum, 'TotalPrepaidAmount'));
    inv.payable = num(childText(sum, 'DuePayableAmount')) || inv.grossTotal - inv.prepaid;
    const header = findFirst(root, 'SupplyChainTradeTransaction');
    inv.seller = partyFromCii(findFirst(header, 'ApplicableHeaderTradeAgreement'), 'seller');
    inv.buyer = partyFromCii(findFirst(header, 'ApplicableHeaderTradeAgreement'), 'buyer');
    inv.buyer.leitwegId = childText(findFirst(header, 'ApplicableHeaderTradeAgreement'), 'BuyerReference');
    inv.deliveryDate = childText(findFirst(findFirst(header, 'ApplicableHeaderTradeDelivery'), 'ActualDeliverySupplyChainEvent'), 'DateTimeString')
      || childText(findFirst(root, 'OccurrenceDateTime'), 'DateTimeString');
    inv.lines = ciiLines(root);
    const headerTaxes = findAll(settle ?? root, 'ApplicableTradeTax').filter((n) => childText(n, 'BasisAmount'));
    inv.taxBreakdown = headerTaxes.map((n) => ({
      category: childText(n, 'CategoryCode') || 'S',
      rate: num(childText(n, 'RateApplicablePercent')),
      base: num(childText(n, 'BasisAmount')),
      amount: num(childText(n, 'CalculatedAmount')),
    }));
    inv.note = childText(findFirst(root, 'IncludedNote'), 'Content');
  } else if (inv.syntax === 'ubl') {
    inv.guidelineId = childText(root, 'CustomizationID');
    inv.profile = detectProfile(inv.guidelineId);
    inv.invoiceNumber = childText(root, 'ID');
    inv.issueDate = childText(root, 'IssueDate');
    inv.dueDate = childText(root, 'DueDate');
    inv.typeCode = childText(root, 'InvoiceTypeCode');
    inv.currency = findFirst(root, 'DocumentCurrencyCode') ? textOf(findFirst(root, 'DocumentCurrencyCode')) : 'EUR';
    inv.seller = partyFromUbl(root, 'seller');
    inv.buyer = partyFromUbl(root, 'buyer');
    inv.buyer.leitwegId = childText(root, 'BuyerReference');
    inv.deliveryDate = childText(findFirst(root, 'Delivery'), 'ActualDeliveryDate');
    inv.lines = ublLines(root);
    const mon = findFirst(root, 'LegalMonetaryTotal');
    inv.netTotal = num(childText(mon, 'TaxExclusiveAmount') || childText(mon, 'LineExtensionAmount'));
    inv.grossTotal = num(childText(mon, 'TaxInclusiveAmount'));
    inv.prepaid = num(childText(mon, 'PrepaidAmount'));
    inv.payable = num(childText(mon, 'PayableAmount')) || inv.grossTotal - inv.prepaid;
    inv.taxTotal = num(childText(findFirst(root, 'TaxTotal'), 'TaxAmount'));
    inv.taxBreakdown = findAll(root, 'TaxSubtotal').map((n) => ({
      category: childText(findFirst(n, 'TaxCategory'), 'ID') || 'S',
      rate: num(childText(findFirst(n, 'TaxCategory'), 'Percent')),
      base: num(childText(n, 'TaxableAmount')),
      amount: num(childText(n, 'TaxAmount')),
    }));
    inv.iban = childText(findFirst(root, 'PayeeFinancialAccount'), 'ID');
    inv.bic = childText(findFirst(root, 'FinancialInstitutionBranch'), 'ID');
    inv.paymentMeans = childText(findFirst(root, 'PaymentMeans'), 'PaymentMeansCode');
    inv.paymentTerms = childText(findFirst(root, 'PaymentTerms'), 'Note');
    inv.note = childText(root, 'Note');
  }
  if (!inv.iban) inv.iban = inv.seller.iban;
  if (inv.iban) inv.seller.iban = inv.iban;
  return inv;
}
