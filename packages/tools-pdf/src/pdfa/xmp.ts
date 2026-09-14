export interface XmpFields {
  part: '2' | '3';
  conformance: 'B';
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  createDate?: string;
  modifyDate?: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isoDate(d?: string): string {
  if (!d) return new Date().toISOString();
  const t = Date.parse(d);
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
}

export function buildPdfaXmp(fields: XmpFields): string {
  const created = isoDate(fields.createDate);
  const modified = isoDate(fields.modifyDate);
  const title = esc(fields.title ?? '');
  const author = esc(fields.author ?? '');
  const subject = esc(fields.subject ?? '');
  const keywords = esc(fields.keywords ?? '');
  const creator = esc(fields.creator ?? 'NeoTools');
  const producer = esc(fields.producer ?? 'NeoTools');
  const body = `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
      <pdfaid:part>${fields.part}</pdfaid:part>
      <pdfaid:conformance>${fields.conformance}</pdfaid:conformance>
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>${author}</rdf:li></rdf:Seq></dc:creator>
      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${subject}</rdf:li></rdf:Alt></dc:description>
      <pdf:Keywords>${keywords}</pdf:Keywords>
      <pdf:Producer>${producer}</pdf:Producer>
      <xmp:CreatorTool>${creator}</xmp:CreatorTool>
      <xmp:CreateDate>${created}</xmp:CreateDate>
      <xmp:ModifyDate>${modified}</xmp:ModifyDate>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
  return body;
}

export function parsePdfaid(xmp: string): { part?: string; conformance?: string } {
  const part = /<pdfaid:part>\s*(\d+)\s*<\/pdfaid:part>/i.exec(xmp)?.[1];
  const conformance = /<pdfaid:conformance>\s*([A-Z])\s*<\/pdfaid:conformance>/i.exec(xmp)?.[1];
  return { part, conformance };
}

export function xmpTextField(xmp: string, local: string): string {
  const tagged = new RegExp(`<(?:dc|pdf|xmp):${local}[^>]*>([\\s\\S]*?)</(?:dc|pdf|xmp):${local}>`, 'i').exec(
    xmp,
  );
  if (!tagged) return '';
  return tagged[1]!.replace(/<[^>]+>/g, '').trim();
}
