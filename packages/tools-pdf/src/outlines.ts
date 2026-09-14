import { PDFDocument, PDFHexString, PDFName, type PDFDict, type PDFRef } from 'pdf-lib';

export function addBookmarks(
  doc: PDFDocument,
  entries: Array<{ title: string; pageIndex: number }>,
): void {
  if (!entries.length) return;
  const ctx = doc.context;
  const refs: PDFRef[] = [];
  const dicts: PDFDict[] = [];

  for (const entry of entries) {
    const page = doc.getPage(entry.pageIndex);
    const dest = ctx.obj([page.ref, 'Fit']);
    const dict = ctx.obj({
      Title: PDFHexString.fromText(entry.title),
      Dest: dest,
    });
    const ref = ctx.register(dict);
    refs.push(ref);
    dicts.push(dict);
  }

  for (let i = 0; i < dicts.length; i++) {
    const dict = dicts[i]!;
    if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1]!);
    if (i < dicts.length - 1) dict.set(PDFName.of('Next'), refs[i + 1]!);
  }

  const outlines = ctx.obj({
    Type: 'Outlines',
    First: refs[0],
    Last: refs[refs.length - 1],
    Count: refs.length,
  });
  const outlinesRef = ctx.register(outlines);
  for (const dict of dicts) dict.set(PDFName.of('Parent'), outlinesRef);
  doc.catalog.set(PDFName.of('Outlines'), outlinesRef);
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}
