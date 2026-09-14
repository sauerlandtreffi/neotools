import type { Doc, DocBlock, Heading } from './model.js';
import { emptyDoc } from './model.js';

interface TextItem {
  str?: string;
  hasEOL?: boolean;
  transform?: number[];
  height?: number;
  width?: number;
}

export async function pdfBytesToDoc(bytes: Uint8Array): Promise<{ doc: Doc; warnings: string[] }> {
  const warnings: string[] = [];
  const { openPdfjsDocument } = await import('@neotools/tools-pdf');
  const pdf = await openPdfjsDocument(bytes);
  const sizes: number[] = [];
  const pages: Array<Array<{ text: string; size: number }>> = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const lines: Array<{ text: string; size: number }> = [];
    let buf = '';
    let size = 12;
    for (const raw of content.items as TextItem[]) {
      const h = Math.abs(raw.transform?.[3] ?? raw.height ?? 12);
      size = h || size;
      buf += raw.str ?? '';
      if (raw.hasEOL) {
        const text = buf.replace(/\s+/g, ' ').trim();
        if (text) {
          lines.push({ text, size });
          sizes.push(size);
        }
        buf = '';
      } else buf += ' ';
    }
    const tail = buf.replace(/\s+/g, ' ').trim();
    if (tail) {
      lines.push({ text: tail, size });
      sizes.push(size);
    }
    pages.push(lines);
  }
  await pdf.destroy();
  const median = medianOf(sizes) || 12;
  const blocks: DocBlock[] = [];
  pages.forEach((lines, pi) => {
    if (pi) blocks.push({ type: 'page-break' });
    let para: string[] = [];
    const flush = () => {
      if (!para.length) return;
      blocks.push({ type: 'paragraph', runs: [{ text: para.join(' ') }] });
      para = [];
    };
    for (const line of lines) {
      if (line.size >= median * 1.45) {
        flush();
        const level = (line.size >= median * 1.9 ? 1 : line.size >= median * 1.65 ? 2 : 3) as Heading['level'];
        blocks.push({ type: 'heading', level, runs: [{ text: line.text, bold: true }] });
      } else if (!line.text || /[.:!?]$/.test(line.text) || line.text.length < 40) {
        para.push(line.text);
        if (/[.:!?]$/.test(line.text)) flush();
      } else para.push(line.text);
    }
    flush();
  });
  if (!blocks.length) warnings.push('Kein Textlayer — PDF wirkt gescannt.');
  return { doc: emptyDoc({ title: blocks.find((b) => b.type === 'heading') && blocks[0]?.type === 'heading' ? (blocks[0] as Heading).runs[0]?.text : undefined, blocks }), warnings };
}

function medianOf(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
