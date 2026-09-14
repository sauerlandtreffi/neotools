import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
} from 'pdf-lib';

export interface OutlineNode {
  title: string;
  pageIndex: number;
  children: OutlineNode[];
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

export function nestHeadings(entries: Array<{ title: string; level: number; pageIndex: number }>): OutlineNode[] {
  const root: OutlineNode[] = [];
  const stack: Array<{ level: number; node: OutlineNode }> = [];
  for (const e of entries) {
    const node: OutlineNode = { title: e.title, pageIndex: e.pageIndex, children: [] };
    while (stack.length && stack[stack.length - 1]!.level >= e.level) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) parent.node.children.push(node);
    else root.push(node);
    stack.push({ level: e.level, node });
  }
  return root;
}
