import { PDFDocument, PDFName, PDFRawStream, StandardFonts, rgb } from 'pdf-lib';
import { convertToPdfa } from '@neotools/tools-pdf';
import type { Platform } from '@neotools/engine';
import { money, round2 } from '../util/money.js';
import { taxModeMeta, withDates, type InvoiceData } from './invoice-data.js';
import { afRelationshipFor, fxConformance } from './profiles.js';
import { setAfRelationship } from './extract-pdf.js';
import { esc } from './xml.js';

function facturXmp(profile: InvoiceData['profile'], title: string): string {
  const created = new Date().toISOString();
  return `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
      xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
      <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>${esc(fxConformance(profile))}</fx:ConformanceLevel>
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(title)}</rdf:li></rdf:Alt></dc:title>
      <pdf:Producer>NeoTools</pdf:Producer>
      <xmp:CreatorTool>NeoTools dach-erechnung-generate</xmp:CreatorTool>
      <xmp:CreateDate>${created}</xmp:CreateDate>
      <xmp:ModifyDate>${created}</xmp:ModifyDate>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

function embedXmp(doc: PDFDocument, xml: string): void {
  const bytes = new TextEncoder().encode(xml);
  const stream = doc.context.stream(bytes, { Type: 'Metadata', Subtype: 'XML' });
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(stream));
}

export async function generateInvoicePdf(
  raw: InvoiceData,
  xml: string,
  platform: Platform,
  logo?: Uint8Array,
): Promise<Uint8Array> {
  const data = withDates(raw);
  const meta = taxModeMeta(data.taxMode);
  const net = round2(data.lines.reduce((s, l) => s + l.net, 0));
  const tax = round2(data.lines.reduce((s, l) => s + (l.net * (l.vatRate || meta.rate)) / 100, 0));
  const gross = round2(net + tax);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  const { height } = page.getSize();
  let y = height - 48;
  if (logo) {
    try {
      const img = logo[0] === 0x89 ? await doc.embedPng(logo) : await doc.embedJpg(logo);
      const w = 90;
      const h = (img.height / img.width) * w;
      page.drawImage(img, { x: 48, y: y - h, width: w, height: h });
    } catch {
      // ignore bad logo
    }
  }
  page.drawText('Rechnung / Invoice', { x: 320, y, size: 18, font: bold, color: rgb(0.12, 0.18, 0.32) });
  y -= 28;
  page.drawText(`${data.invoiceNumber}  ·  ${data.issueDate}`, { x: 320, y, size: 10, font });
  y -= 36;
  page.drawText('Verkäufer', { x: 48, y, size: 9, font: bold });
  page.drawText('Käufer', { x: 320, y, size: 9, font: bold });
  y -= 14;
  const seller = [data.seller.name, data.seller.street, `${data.seller.zip} ${data.seller.city}`, data.seller.vatId];
  const buyer = [data.buyer.name, data.buyer.street, `${data.buyer.zip} ${data.buyer.city}`, data.buyer.leitwegId];
  for (let i = 0; i < 4; i++) {
    page.drawText(seller[i] || '', { x: 48, y, size: 9, font });
    page.drawText(buyer[i] || '', { x: 320, y, size: 9, font });
    y -= 12;
  }
  y -= 16;
  page.drawText('Pos  Bezeichnung                         Menge      Netto   USt%', { x: 48, y, size: 9, font: bold });
  y -= 14;
  data.lines.forEach((l, i) => {
    page.drawText(
      `${String(i + 1).padStart(2, ' ')}   ${(l.name || '').slice(0, 28).padEnd(28)} ${String(l.qty).padStart(6)}  ${money(l.net).padStart(8)}  ${money(l.vatRate || meta.rate)}`,
      { x: 48, y, size: 9, font },
    );
    y -= 12;
  });
  y -= 18;
  page.drawText(`Netto     ${money(net)} ${data.currency}`, { x: 360, y, size: 10, font });
  y -= 14;
  page.drawText(`USt       ${money(tax)} ${data.currency}`, { x: 360, y, size: 10, font });
  y -= 14;
  page.drawText(`Brutto    ${money(gross)} ${data.currency}`, { x: 360, y, size: 12, font: bold });
  y -= 28;
  page.drawText(`IBAN ${data.seller.iban}  BIC ${data.seller.bic}`, { x: 48, y, size: 9, font });
  y -= 12;
  page.drawText(data.paymentTerms.slice(0, 90), { x: 48, y, size: 9, font });
  if (meta.exemption) {
    y -= 12;
    page.drawText(meta.exemption.slice(0, 90), { x: 48, y, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
  }

  const bytes = new Uint8Array(await doc.save({ updateFieldAppearances: false, useObjectStreams: false }));
  const converted = await convertToPdfa(bytes, { profile: '3b', rasterizeFallback: false }, platform);
  const again = await PDFDocument.load(new Uint8Array(converted.bytes), { ignoreEncryption: true, updateMetadata: false });
  again.setTitle(`Rechnung ${data.invoiceNumber}`);
  again.setAuthor(data.seller.name);
  again.setProducer('NeoTools');
  embedXmp(again, facturXmp(data.profile, `Rechnung ${data.invoiceNumber}`));
  await again.attach(xml, 'factur-x.xml', {
    mimeType: 'text/xml',
    description: 'Factur-X invoice',
    creationDate: new Date(),
    modificationDate: new Date(),
  });
  const xmlBytes = new TextEncoder().encode(xml);
  const stream = PDFRawStream.of(again.context.obj({ Type: 'EmbeddedFile', Length: xmlBytes.length }), xmlBytes);
  again.catalog.set(PDFName.of('NeoFacturX'), again.context.register(stream));
  const out = new Uint8Array(await again.save({ updateFieldAppearances: false, useObjectStreams: false }));
  return new Uint8Array(await setAfRelationship(out, afRelationshipFor(data.profile)));
}
