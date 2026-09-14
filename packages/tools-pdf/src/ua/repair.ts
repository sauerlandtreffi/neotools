import { PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';

export interface RepairOptions {
  lang: string;
  title: string;
  tag: boolean;
}

export async function repairPdfUa(bytes: Uint8Array, opts: RepairOptions): Promise<{ bytes: Uint8Array; notes: string[] }> {
  const notes: string[] = [];
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  if (opts.lang) {
    doc.setLanguage(opts.lang);
    notes.push(`Lang=${opts.lang}`);
  }
  if (opts.title) {
    doc.setTitle(opts.title);
    notes.push('Title gesetzt');
  } else if (!doc.getTitle()) {
    doc.setTitle('Dokument');
    notes.push('Platzhalter-Titel');
  }
  const vp =
    doc.catalog.lookupMaybe(PDFName.of('ViewerPreferences'), PDFDict) ??
    (doc.catalog.set(PDFName.of('ViewerPreferences'), doc.context.obj({})) ,
    doc.catalog.lookup(PDFName.of('ViewerPreferences')));
  if (vp instanceof PDFDict) vp.set(PDFName.of('DisplayDocTitle'), doc.context.obj(true));
  doc.catalog.set(PDFName.of('MarkInfo'), doc.context.obj({ Marked: true }));
  for (const page of doc.getPages()) {
    page.node.set(PDFName.of('Tabs'), PDFName.of('S'));
  }
  embedPdfUaXmp(doc, doc.getTitle() ?? 'Dokument');
  notes.push('MarkInfo, Tabs /S, pdfuaid XMP');
  if (opts.tag && !doc.catalog.has(PDFName.of('StructTreeRoot'))) {
    const struct = doc.context.obj({
      Type: 'StructTreeRoot',
      K: doc.context.obj({ Type: 'StructElem', S: 'Document', P: undefined, K: [] }),
    });
    doc.catalog.set(PDFName.of('StructTreeRoot'), doc.context.register(struct));
    notes.push(
      'Auto-Tagging light: StructTreeRoot/Document ohne MCID in Content-Streams (zu riskant). Screenreader folgen den Tags oft nicht — ehrlich als Teilreparatur markiert.',
    );
  } else if (!opts.tag) {
    notes.push('Reparatur ohne Tagging (kein Content-Stream-Rewrite).');
  }
  const out = new Uint8Array(await doc.save({ updateFieldAppearances: false, useObjectStreams: false }));
  return { bytes: out, notes };
}

function embedPdfUaXmp(doc: PDFDocument, title: string): void {
  const xml = `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/"
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
      <pdfuaid:part>1</pdfuaid:part>
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</rdf:li></rdf:Alt></dc:title>
      <pdf:Producer>NeoTools pdf-ua</pdf:Producer>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
  const stream = doc.context.stream(new TextEncoder().encode(xml), { Type: 'Metadata', Subtype: 'XML' });
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(stream));
  void PDFString;
}
