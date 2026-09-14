export type Align = 'left' | 'center' | 'right' | 'justify';

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  href?: string;
  color?: string;
}

export interface Paragraph {
  type: 'paragraph';
  runs: Run[];
  align?: Align;
}

export interface Heading {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  runs: Run[];
}

export interface ListItem {
  blocks: DocBlock[];
  checked?: boolean;
}

export interface ListBlock {
  type: 'list';
  ordered: boolean;
  items: ListItem[];
  start?: number;
}

export interface TableCell {
  blocks: DocBlock[];
}

export interface TableRow {
  cells: TableCell[];
}

export interface TableBlock {
  type: 'table';
  header?: boolean;
  rows: TableRow[];
}

export interface ImageBlock {
  type: 'image';
  bytes?: Uint8Array;
  mime?: string;
  alt?: string;
  href?: string;
  width?: number;
  height?: number;
}

export interface PageBreak {
  type: 'page-break';
}

export interface CodeBlock {
  type: 'code';
  language?: string;
  text: string;
}

export interface ThematicBreak {
  type: 'hr';
}

export interface Note {
  id: string;
  blocks: DocBlock[];
}

export type DocBlock = Paragraph | Heading | ListBlock | TableBlock | ImageBlock | PageBreak | CodeBlock | ThematicBreak;

export interface DocStyles {
  theme?: 'default' | 'github' | 'academic';
}

export interface Doc {
  title?: string;
  author?: string;
  blocks: DocBlock[];
  styles?: DocStyles;
  header?: string;
  footer?: string;
  footnotes?: Note[];
  endnotes?: Note[];
}

export function runText(runs: Run[]): string {
  return runs.map((r) => r.text).join('');
}

export function textRun(text: string, extra: Omit<Run, 'text'> = {}): Run {
  return { text, ...extra };
}

export function paragraph(text: string, extra: Partial<Paragraph> = {}): Paragraph {
  return { type: 'paragraph', runs: [textRun(text)], ...extra };
}

export function heading(level: Heading['level'], text: string): Heading {
  return { type: 'heading', level, runs: [textRun(text)] };
}

export function emptyDoc(partial: Partial<Doc> = {}): Doc {
  return { blocks: [], ...partial };
}

export function blockPlainText(block: DocBlock): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
      return runText(block.runs);
    case 'list':
      return block.items.map((it) => it.blocks.map(blockPlainText).join(' ')).join('\n');
    case 'table':
      return block.rows.map((row) => row.cells.map((c) => c.blocks.map(blockPlainText).join(' ')).join('\t')).join('\n');
    case 'image':
      return block.alt ?? '';
    case 'code':
      return block.text;
    case 'page-break':
    case 'hr':
      return '';
  }
}

export function docPlainText(doc: Doc): string {
  return doc.blocks.map(blockPlainText).filter(Boolean).join('\n');
}

export function modelFingerprint(doc: Doc): unknown {
  const fpBlock = (block: DocBlock): unknown => {
    switch (block.type) {
      case 'paragraph':
        return { type: 'paragraph', text: runText(block.runs), align: block.align };
      case 'heading':
        return { type: 'heading', level: block.level, text: runText(block.runs) };
      case 'list':
        return {
          type: 'list',
          ordered: block.ordered,
          items: block.items.map((it) => ({
            checked: it.checked,
            blocks: it.blocks.map(fpBlock),
          })),
        };
      case 'table':
        return {
          type: 'table',
          header: block.header,
          rows: block.rows.map((r) => r.cells.map((c) => c.blocks.map(fpBlock))),
        };
      case 'image':
        return { type: 'image', alt: block.alt ?? '', bytes: block.bytes?.byteLength ?? 0 };
      case 'code':
        return { type: 'code', language: block.language ?? '', text: block.text };
      case 'page-break':
        return { type: 'page-break' };
      case 'hr':
        return { type: 'hr' };
    }
  };
  return {
    title: doc.title ?? '',
    blocks: doc.blocks.map(fpBlock),
  };
}

export function walkBlocks(blocks: DocBlock[], visit: (block: DocBlock) => void): void {
  for (const block of blocks) {
    visit(block);
    if (block.type === 'list') {
      for (const item of block.items) walkBlocks(item.blocks, visit);
    } else if (block.type === 'table') {
      for (const row of block.rows) {
        for (const cell of row.cells) walkBlocks(cell.blocks, visit);
      }
    }
  }
}
