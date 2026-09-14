import { isValidIban } from '../girocode/iban.js';
import { compactDate, money, round2 } from '../util/money.js';
import { taxModeMeta, withDates, type InvoiceData } from './invoice-data.js';
import { guidelineFor } from './profiles.js';
import { esc } from './xml.js';

function dt(iso: string): string {
  return compactDate(iso.slice(0, 10));
}

export function generateCii(raw: InvoiceData): string {
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
  const taxXml: string[] = [];
  for (const [rate, base] of byRate) {
    const amount = round2((base * rate) / 100);
    tax = round2(tax + amount);
    taxXml.push(`        <ram:ApplicableTradeTax>
          <ram:CalculatedAmount>${money(amount)}</ram:CalculatedAmount>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:ExemptionReason>${esc(meta.exemption)}</ram:ExemptionReason>
          <ram:CategoryCode>${meta.category}</ram:CategoryCode>
          <ram:RateApplicablePercent>${money(rate)}</ram:RateApplicablePercent>
          <ram:BasisAmount>${money(base)}</ram:BasisAmount>
        </ram:ApplicableTradeTax>`);
  }
  const gross = round2(net + tax);
  const iban = data.seller.iban.replace(/\s/g, '');
  if (iban && !isValidIban(iban)) {
    // still emit — validator will flag BR-IBAN-01
  }
  const skonto =
    data.skontoPercent > 0
      ? ` Skonto ${data.skontoPercent}% bei Zahlung binnen ${data.skontoDays} Tagen.`
      : '';
  const guideline = guidelineFor(data.profile);
  const lineXml = lines
    .map((l, i) => {
      const rate = l.vatRate;
      return `      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument>
          <ram:LineID>${i + 1}</ram:LineID>
        </ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct>
          <ram:Name>${esc(l.name)}</ram:Name>
        </ram:SpecifiedTradeProduct>
        <ram:SpecifiedLineTradeAgreement>
          <ram:NetPriceProductTradePrice>
            <ram:ChargeAmount>${money(l.qty ? l.net / l.qty : l.net)}</ram:ChargeAmount>
          </ram:NetPriceProductTradePrice>
        </ram:SpecifiedLineTradeAgreement>
        <ram:SpecifiedLineTradeDelivery>
          <ram:BilledQuantity unitCode="${esc(l.unit)}">${l.qty}</ram:BilledQuantity>
        </ram:SpecifiedLineTradeDelivery>
        <ram:SpecifiedLineTradeSettlement>
          <ram:ApplicableTradeTax>
            <ram:TypeCode>VAT</ram:TypeCode>
            <ram:CategoryCode>${meta.category}</ram:CategoryCode>
            <ram:RateApplicablePercent>${money(rate)}</ram:RateApplicablePercent>
          </ram:ApplicableTradeTax>
          <ram:SpecifiedTradeSettlementLineMonetarySummation>
            <ram:LineTotalAmount>${money(l.net)}</ram:LineTotalAmount>
          </ram:SpecifiedTradeSettlementLineMonetarySummation>
        </ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>${esc(guideline)}</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(data.invoiceNumber)}</ram:ID>
    <ram:TypeCode>${esc(data.typeCode)}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${dt(data.issueDate)}</udt:DateTimeString>
    </ram:IssueDateTime>
    <ram:IncludedNote>
      <ram:Content>${esc((data.note + skonto).trim())}</ram:Content>
    </ram:IncludedNote>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
${lineXml}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${esc(data.buyer.leitwegId)}</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>${esc(data.seller.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(data.seller.zip)}</ram:PostcodeCode>
          <ram:LineOne>${esc(data.seller.street)}</ram:LineOne>
          <ram:CityName>${esc(data.seller.city)}</ram:CityName>
          <ram:CountryID>${esc(data.seller.country)}</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${esc(data.seller.email)}</ram:URIID>
        </ram:URIUniversalCommunication>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${esc(data.seller.vatId)}</ram:ID>
        </ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(data.buyer.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(data.buyer.zip)}</ram:PostcodeCode>
          <ram:LineOne>${esc(data.buyer.street)}</ram:LineOne>
          <ram:CityName>${esc(data.buyer.city)}</ram:CityName>
          <ram:CountryID>${esc(data.buyer.country)}</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${esc(data.buyer.vatId)}</ram:ID>
        </ram:SpecifiedTaxRegistration>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">${dt(data.deliveryDate)}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${esc(data.currency)}</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${esc(iban)}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>
        <ram:PayeeSpecifiedCreditorFinancialInstitution>
          <ram:BICID>${esc(data.seller.bic)}</ram:BICID>
        </ram:PayeeSpecifiedCreditorFinancialInstitution>
      </ram:SpecifiedTradeSettlementPaymentMeans>
${taxXml.join('\n')}
      <ram:SpecifiedTradePaymentTerms>
        <ram:Description>${esc(data.paymentTerms + skonto)}</ram:Description>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${dt(data.dueDate)}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${money(net)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${money(net)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${esc(data.currency)}">${money(tax)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${money(gross)}</ram:GrandTotalAmount>
        <ram:TotalPrepaidAmount>0.00</ram:TotalPrepaidAmount>
        <ram:DuePayableAmount>${money(gross)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}
