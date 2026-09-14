import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
} from 'pdf-lib';

export function addBookmarks(
  doc: PDFDocument,
  entries: Array<{ title: string; pageIndex: number }>,
): void {
  addOutlineTree(
    doc,
    entries.map((e) => ({ title: e.title, pageIndex: e.pageIndex, children: [] })),
  );
}

export interface OutlineNode {
  title: string;
  pageIndex: number;
  children: OutlineNode[];
}

function pageIndexOfRef(doc: PDFDocument, ref: PDFRef): number {
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    if (pages[i]!.ref === ref) return i;
  }
  return 0;
}

function destPageIndex(doc: PDFDocument, dest: unknown): number {
  if (dest instanceof PDFArray && dest.size() > 0) {
    const first = dest.get(0);
    if (first instanceof PDFRef) return pageIndexOfRef(doc, first);
    const looked = dest.lookup(0);
    if (looked && typeof looked === 'object' && 'ref' in looked) {
      const pageRef = (looked as { ref?: PDFRef }).ref;
      if (pageRef) return pageIndexOfRef(doc, pageRef);
    }
  }
  return 0;
}

function titleOf(dict: PDFDict): string {
  const titleObj = dict.lookup(PDFName.of('Title'));
  if (titleObj instanceof PDFHexString || titleObj instanceof PDFString) return titleObj.decodeText();
  return '';
}

function walkOutline(doc: PDFDocument, dict: PDFDict, seen: Set<PDFDict>): OutlineNode {
  seen.add(dict);
  let pageIndex = 0;
  if (dict.has(PDFName.of('Dest'))) {
    pageIndex = destPageIndex(doc, dict.lookup(PDFName.of('Dest')));
  } else if (dict.has(PDFName.of('A'))) {
    const action = dict.lookup(PDFName.of('A'));
    if (action instanceof PDFDict && action.has(PDFName.of('D'))) {
      pageIndex = destPageIndex(doc, action.lookup(PDFName.of('D')));
    }
  }
  const children: OutlineNode[] = [];
  const first = dict.lookup(PDFName.of('First'));
  if (first instanceof PDFDict) {
    let cur: PDFDict | undefined = first;
    while (cur && !seen.has(cur)) {
      children.push(walkOutline(doc, cur, seen));
      const nxt: unknown = cur.lookup(PDFName.of('Next'));
      cur = nxt instanceof PDFDict ? nxt : undefined;
    }
  }
  return { title: titleOf(dict), pageIndex, children };
}

export function extractOutlines(doc: PDFDocument): OutlineNode[] {
  const outlines = doc.catalog.lookup(PDFName.of('Outlines'));
  if (!(outlines instanceof PDFDict)) return [];
  const first = outlines.lookup(PDFName.of('First'));
  if (!(first instanceof PDFDict)) return [];
  const seen = new Set<PDFDict>();
  const nodes: OutlineNode[] = [];
  let cur: PDFDict | undefined = first;
  while (cur) {
    nodes.push(walkOutline(doc, cur, seen));
    const nxt: unknown = cur.lookup(PDFName.of('Next'));
    cur = nxt instanceof PDFDict ? nxt : undefined;
  }
  return nodes;
}

export function offsetOutlines(nodes: OutlineNode[], delta: number): OutlineNode[] {
  return nodes.map((n) => ({
    title: n.title,
    pageIndex: n.pageIndex + delta,
    children: offsetOutlines(n.children, delta),
  }));
}

function writeNodes(
  doc: PDFDocument,
  nodes: OutlineNode[],
  parentRef: PDFRef,
): { first?: PDFRef; last?: PDFRef; count: number } {
  if (!nodes.length) return { count: 0 };
  const ctx = doc.context;
  const refs: PDFRef[] = [];
  const dicts: PDFDict[] = [];
  let extra = 0;
  for (const node of nodes) {
    const max = Math.max(0, doc.getPageCount() - 1);
    const page = doc.getPage(Math.max(0, Math.min(node.pageIndex, max)));
    const dict = ctx.obj({
      Title: PDFHexString.fromText(node.title),
      Dest: ctx.obj([page.ref, 'Fit']),
      Parent: parentRef,
    });
    const ref = ctx.register(dict);
    refs.push(ref);
    dicts.push(dict);
    const kids = writeNodes(doc, node.children, ref);
    extra += kids.count;
    if (kids.first) dict.set(PDFName.of('First'), kids.first);
    if (kids.last) dict.set(PDFName.of('Last'), kids.last);
    if (kids.count) dict.set(PDFName.of('Count'), PDFNumber.of(kids.count));
  }
  for (let i = 0; i < dicts.length; i++) {
    if (i > 0) dicts[i]!.set(PDFName.of('Prev'), refs[i - 1]!);
    if (i < dicts.length - 1) dicts[i]!.set(PDFName.of('Next'), refs[i + 1]!);
  }
  return { first: refs[0], last: refs[refs.length - 1], count: refs.length + extra };
}

export function addOutlineTree(doc: PDFDocument, nodes: OutlineNode[]): void {
  if (!nodes.length) return;
  const ctx = doc.context;
  const outlines = ctx.obj({ Type: 'Outlines' });
  const outlinesRef = ctx.register(outlines);
  const { first, last, count } = writeNodes(doc, nodes, outlinesRef);
  if (first) outlines.set(PDFName.of('First'), first);
  if (last) outlines.set(PDFName.of('Last'), last);
  outlines.set(PDFName.of('Count'), PDFNumber.of(count));
  doc.catalog.set(PDFName.of('Outlines'), outlinesRef);
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}
