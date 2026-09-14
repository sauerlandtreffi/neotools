import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
  type RGB,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Doc, DocBlock, Run, TableBlock } from './model.js';
import { docPlainText, runText } from './model.js';
import { loadFace, pickStyle, type FontRole, type FontStyle } from './fonts.js';
import { addOutlineTree, nestHeadings } from './outline.js';
import { highlightCode } from './markdown.js';

export type PageFormat = 'a4' | 'letter';

export interface PdfRenderOptions {
  page?: PageFormat;
  landscape?: boolean;
  margin?: number;
  theme?: 'default' | 'github' | 'academic';
  titlePage?: boolean;
  title?: string;
  author?: string;
  header?: string;
  toc?: boolean;
  fontRole?: FontRole;
}

export interface PdfRenderResult {
  bytes: Uint8Array;
  pageCount: number;
  warnings: string[];
}

const SIZES: Record<PageFormat, { w: number; h: number }> = {
  a4: { w: 595.28, h: 841.89 },
  letter: { w: 612, h: 792 },
};

const THEME_COLOR: Record<string, RGB> = {
  default: rgb(0.12, 0.12, 0.14),
  github: rgb(0.1, 0.1, 0.12),
  academic: rgb(0.08, 0.08, 0.1),
};

interface FontBag {
  standard: { sans: PDFFont; bold: PDFFont; italic: PDFFont; mono: PDFFont };
  embedded: Map<string, PDFFont>;
}

async function embedFace(doc: PDFDocument, bag: FontBag, role: FontRole, style: FontStyle): Promise<PDFFont> {
  const key = `${role}:${style}`;
  const hit = bag.embedded.get(key);
  if (hit) return hit;
  const face = await loadFace(role, style);
  if (face) {
    try {
      const font = await doc.embedFont(face.bytes, { subset: true });
      bag.embedded.set(key, font);
      return font;
    } catch {
      // fall through
    }
  }
  if (role === 'mono') return bag.standard.mono;
  if (style === 'bold' || style === 'boldItalic') return bag.standard.bold;
  if (style === 'italic') return bag.standard.italic;
  return bag.standard.sans;
}

function pageSize(opts: PdfRenderOptions): { w: number; h: number } {
  const base = SIZES[opts.page ?? 'a4'];
  return opts.landscape ? { w: base.h, h: base.w } : base;
}

function wrapRuns(
  runs: Run[],
  fontOf: (run: Run) => PDFFont,
  size: number,
  maxWidth: number,
): Array<Array<{ run: Run; font: PDFFont; text: string; width: number }>> {
  const lines: Array<Array<{ run: Run; font: PDFFont; text: string; width: number }>> = [[]];
  let lineWidth = 0;
  const push = (run: Run, text: string) => {
    const font = fontOf(run);
    const parts = text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      if (part === '\n') {
        lines.push([]);
        lineWidth = 0;
        continue;
      }
      const w = font.widthOfTextAtSize(part, size);
      const last = lines[lines.length - 1]!;
      if (lineWidth + w > maxWidth && last.length && !/^\s+$/.test(part)) {
        lines.push([{ run, font, text: part.replace(/^\s+/, ''), width: w }]);
        lineWidth = w;
      } else {
        last.push({ run, font, text: part, width: w });
        lineWidth += w;
      }
    }
  };
  for (const run of runs) {
    const chunks = run.text.split('\n');
    chunks.forEach((c, i) => {
      push(run, c);
      if (i < chunks.length - 1) {
        lines.push([]);
        lineWidth = 0;
      }
    });
  }
  return lines.filter((l, i) => l.length || i === 0);
}

async function embedDocImage(doc: PDFDocument, bytes: Uint8Array, mime?: string): Promise<PDFImage | undefined> {
  const isPng = mime === 'image/png' || (bytes[0] === 0x89 && bytes[1] === 0x50);
  const isJpg = mime === 'image/jpeg' || mime === 'image/jpg' || bytes[0] === 0xff;
  try {
    if (isPng) return await doc.embedPng(bytes);
    if (isJpg) return await doc.embedJpg(bytes);
  } catch {
    // transcode
  }
  try {
    const { decode, encode } = await import('@neotools/tools-image');
    const img = await decode({ bytes, mime });
    const jpg = await encode(img, 'jpeg', { quality: 85, keepMetadata: false });
    return await doc.embedJpg(jpg);
  } catch {
    try {
      const { decode, encode } = await import('@neotools/tools-image');
      const img = await decode({ bytes, mime });
      const png = await encode(img, 'png', { keepMetadata: false });
      return await doc.embedPng(png);
    } catch {
      return undefined;
    }
  }
}

function safeDraw(page: PDFPage, text: string, font: PDFFont, size: number, x: number, y: number, color: RGB, warnings: string[]): number {
  const usable = [...text]
    .map((ch) => {
      try {
        font.encodeText(ch);
        return ch;
      } catch {
        warnings.push(`Zeichen außerhalb der Schrift: U+${ch.codePointAt(0)?.toString(16).toUpperCase()}`);
        return '';
      }
    })
    .join('');
  if (!usable) return 0;
  page.drawText(usable, { x, y, size, font, color });
  return font.widthOfTextAtSize(usable, size);
}

export async function renderDocToPdf(doc: Doc, options: PdfRenderOptions = {}): Promise<PdfRenderResult> {
  const warnings: string[] = [];
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const bag: FontBag = {
    standard: {
      sans: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
      italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
      mono: await pdf.embedFont(StandardFonts.Courier),
    },
    embedded: new Map(),
  };
  const theme = options.theme ?? doc.styles?.theme ?? 'default';
  const defaultRole: FontRole = theme === 'academic' ? 'serif' : 'sans';
  const color = THEME_COLOR[theme] ?? THEME_COLOR.default!;
  const size = pageSize(options);
  const margin = options.margin ?? 56;
  const headerSpace = 28;
  const footerSpace = 32;
  const contentWidth = size.w - margin * 2;
  const contentTop = size.h - margin - headerSpace;
  const contentBottom = margin + footerSpace;

  const headings: Array<{ title: string; level: number; pageIndex: number }> = [];
  const links: Array<{ page: PDFPage; x: number; y: number; w: number; h: number; url: string }> = [];

  let page = pdf.addPage([size.w, size.h]);
  let y = contentTop;
  const title = options.title ?? doc.title ?? '';

  const fontOf = async (run: Run, role: FontRole = defaultRole): Promise<PDFFont> => {
    const style = pickStyle(run.bold, run.italic);
    const useRole = run.code ? 'mono' : role;
    return embedFace(pdf, bag, useRole, style);
  };

  const ensure = (need: number) => {
    if (y - need < contentBottom) {
      page = pdf.addPage([size.w, size.h]);
      y = contentTop;
    }
  };

  const drawHeaderFooter = () => {
    // applied at the end for every page
  };
  void drawHeaderFooter;

  if (options.titlePage && (title || options.author || doc.author)) {
    const tFont = await embedFace(pdf, bag, defaultRole, 'bold');
    page.drawText(title || 'Dokument', {
      x: margin,
      y: size.h / 2,
      size: 28,
      font: tFont,
      color,
    });
    if (options.author || doc.author) {
      page.drawText(options.author ?? doc.author ?? '', {
        x: margin,
        y: size.h / 2 - 36,
        size: 14,
        font: bag.standard.sans,
        color,
      });
    }
    page = pdf.addPage([size.w, size.h]);
    y = contentTop;
  }

  const drawRuns = async (runs: Run[], sizePt: number, indent = 0) => {
    const maxW = contentWidth - indent;
    const resolved: Run[] = [];
    for (const run of runs) {
      if (/\$\$[\s\S]+\$\$|\$[^$]+\$/.test(run.text)) {
        const parts = run.text.split(/(\$\$[\s\S]+?\$\$|\$[^$]+\$)/);
        for (const p of parts) {
          if (!p) continue;
          if (p.startsWith('$')) {
            const tex = p.replace(/^\$+|\$+$/g, '');
            const raster = await rasterKatex(tex);
            if (raster) {
              ensure(raster.height * 0.5 + 8);
              const img = await pdf.embedPng(raster.png);
              const w = Math.min(maxW, raster.width * 0.5);
              const h = (img.height / img.width) * w;
              page.drawImage(img, { x: margin + indent, y: y - h, width: w, height: h });
              y -= h + 6;
            } else {
              warnings.push(`Formel als Text (Node/ohne Canvas): ${tex}`);
              resolved.push({ ...run, text: tex, italic: true });
            }
          } else resolved.push({ ...run, text: p });
        }
      } else resolved.push(run);
    }
    const fonts = new Map<Run, PDFFont>();
    for (const run of resolved) fonts.set(run, await fontOf(run));
    const lines = wrapRuns(resolved, (r) => fonts.get(r) ?? bag.standard.sans, sizePt, maxW);
    const lineH = sizePt * 1.35;
    for (const line of lines) {
      ensure(lineH);
      let x = margin + indent;
      for (const part of line) {
        const w = safeDraw(page, part.text, part.font, sizePt, x, y - sizePt, part.run.color ? hexRgb(part.run.color) : color, warnings);
        if (part.run.href) {
          links.push({ page, x, y: y - sizePt, w: part.width, h: sizePt + 2, url: part.run.href });
        }
        if (part.run.underline) {
          page.drawLine({
            start: { x, y: y - sizePt - 1 },
            end: { x: x + part.width, y: y - sizePt - 1 },
            thickness: 0.6,
            color,
          });
        }
        x += w || part.width;
      }
      y -= lineH;
    }
  };

  const drawBlocks = async (blocks: DocBlock[], indent = 0): Promise<void> => {
    for (const block of blocks) {
      if (block.type === 'heading') {
        const sizes = [22, 18, 15, 13, 12, 11];
        const sz = sizes[block.level - 1] ?? 12;
        y -= block.level === 1 ? 16 : 10;
        ensure(sz * 1.6);
        const pageIndex = pdf.getPageCount() - 1;
        headings.push({ title: runText(block.runs), level: block.level, pageIndex });
        await drawRuns(
          block.runs.map((r) => ({ ...r, bold: true })),
          sz,
          indent,
        );
        y -= 6;
      } else if (block.type === 'paragraph') {
        y -= 4;
        await drawRuns(block.runs, 11, indent);
        y -= 6;
      } else if (block.type === 'list') {
        let i = block.start ?? 1;
        for (const item of block.items) {
          ensure(16);
          const mark = block.ordered ? `${i}.` : item.checked === undefined ? '•' : item.checked ? '☑' : '☐';
          const font = await embedFace(pdf, bag, defaultRole, 'regular');
          safeDraw(page, mark, font, 11, margin + indent, y - 11, color, warnings);
          const inner = item.blocks.length ? item.blocks : [{ type: 'paragraph' as const, runs: [{ text: '' }] }];
          const saved = y;
          await drawBlocks(inner, indent + 18);
          if (y === saved) y -= 14;
          i += 1;
        }
        y -= 4;
      } else if (block.type === 'table') {
        await drawTable(block, indent);
      } else if (block.type === 'code') {
        await drawCode(block.text, block.language, indent);
      } else if (block.type === 'image') {
        if (!block.bytes) {
          warnings.push('Bild ohne Bytes übersprungen.');
          continue;
        }
        const img = await embedDocImage(pdf, block.bytes, block.mime);
        if (!img) {
          warnings.push('Bild konnte nicht eingebettet werden.');
          continue;
        }
        const maxW = contentWidth - indent;
        const w = Math.min(maxW, img.width);
        const h = (img.height / img.width) * w;
        ensure(h + 8);
        page.drawImage(img, { x: margin + indent, y: y - h, width: w, height: h });
        y -= h + 10;
      } else if (block.type === 'page-break') {
        page = pdf.addPage([size.w, size.h]);
        y = contentTop;
      } else if (block.type === 'hr') {
        ensure(12);
        page.drawLine({
          start: { x: margin + indent, y },
          end: { x: size.w - margin, y },
          thickness: 0.8,
          color: rgb(0.7, 0.7, 0.7),
        });
        y -= 14;
      }
    }
  };

  const drawCode = async (text: string, language: string | undefined, indent: number) => {
    const font = await embedFace(pdf, bag, 'mono', 'regular');
    const sizePt = 9;
    const hl = highlightCode(text, language);
    void hl;
    const lines = text.replace(/\n$/, '').split('\n');
    const lineH = 12;
    const boxH = lines.length * lineH + 12;
    ensure(Math.min(boxH, contentTop - contentBottom));
    const boxY = y - boxH;
    page.drawRectangle({
      x: margin + indent,
      y: boxY,
      width: contentWidth - indent,
      height: boxH,
      color: rgb(0.96, 0.96, 0.96),
    });
    let cy = y - 14;
    for (const line of lines) {
      if (cy < contentBottom + 8) {
        page = pdf.addPage([size.w, size.h]);
        y = contentTop;
        cy = y - 14;
      }
      safeDraw(page, line || ' ', font, sizePt, margin + indent + 8, cy, color, warnings);
      cy -= lineH;
    }
    y = cy - 8;
  };

  const drawTable = async (table: TableBlock, indent: number) => {
    const cols = Math.max(...table.rows.map((r) => r.cells.length), 1);
    const colW = (contentWidth - indent) / cols;
    const headerBg = rgb(0.92, 0.93, 0.95);
    const drawRow = async (row: TableBlock['rows'][number], header: boolean) => {
      const cellLines: string[][] = [];
      const font = await embedFace(pdf, bag, defaultRole, header ? 'bold' : 'regular');
      for (const cell of row.cells) {
        const text = cell.blocks.map((b) => (b.type === 'paragraph' || b.type === 'heading' ? runText(b.runs) : b.type === 'code' ? b.text : '')).join(' ');
        const wrapped: string[] = [];
        let line = '';
        for (const word of text.split(/(\s+)/)) {
          const test = line + word;
          if (font.widthOfTextAtSize(test, 9) > colW - 8 && line) {
            wrapped.push(line);
            line = word.trimStart();
          } else line = test;
        }
        if (line) wrapped.push(line);
        if (!wrapped.length) wrapped.push('');
        cellLines.push(wrapped);
      }
      const rowH = Math.max(...cellLines.map((l) => l.length), 1) * 12 + 8;
      ensure(rowH);
      if (header) {
        page.drawRectangle({
          x: margin + indent,
          y: y - rowH,
          width: contentWidth - indent,
          height: rowH,
          color: headerBg,
        });
      }
      for (let c = 0; c < cols; c++) {
        const x = margin + indent + c * colW;
        page.drawRectangle({
          x,
          y: y - rowH,
          width: colW,
          height: rowH,
          borderColor: rgb(0.7, 0.7, 0.7),
          borderWidth: 0.6,
        });
        const lines = cellLines[c] ?? [''];
        let ty = y - 14;
        for (const ln of lines) {
          safeDraw(page, ln, font, 9, x + 4, ty, color, warnings);
          ty -= 12;
        }
      }
      y -= rowH;
    };
    for (let i = 0; i < table.rows.length; i++) {
      const isHeader = Boolean(table.header && i === 0);
      if (isHeader && y < contentBottom + 40) {
        page = pdf.addPage([size.w, size.h]);
        y = contentTop;
      }
      await drawRow(table.rows[i]!, isHeader);
    }
    y -= 8;
  };

  if (options.toc) {
    const tocHeading: DocBlock = { type: 'heading', level: 1, runs: [{ text: 'Inhalt', bold: true }] };
    await drawBlocks([tocHeading]);
    for (const h of collectHeadingTitles(doc.blocks)) {
      await drawBlocks([{ type: 'paragraph', runs: [{ text: `${'  '.repeat(Math.max(0, h.level - 1))}${h.title}` }] }]);
    }
    y -= 12;
  }

  await drawBlocks(doc.blocks);

  const headerText = options.header ?? doc.header ?? title;
  const pages = pdf.getPages();
  const headerFont = await embedFace(pdf, bag, defaultRole, 'regular');
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]!;
    if (headerText) {
      safeDraw(p, headerText, headerFont, 9, margin, size.h - margin + 4, rgb(0.35, 0.35, 0.38), warnings);
    }
    const label = String(i + 1);
    const w = headerFont.widthOfTextAtSize(label, 9);
    safeDraw(p, label, headerFont, 9, (size.w - w) / 2, margin - 18, rgb(0.35, 0.35, 0.38), warnings);
  }

  for (const link of links) {
    link.page.drawRectangle({
      x: link.x,
      y: link.y,
      width: link.w,
      height: link.h,
      borderWidth: 0,
      opacity: 0,
    });
    try {
        const { PDFName, PDFHexString } = await import('pdf-lib');
        const annot = pdf.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [link.x, link.y, link.x + link.w, link.y + link.h],
          Border: [0, 0, 0],
          A: { Type: 'Action', S: 'URI', URI: PDFHexString.fromText(link.url) },
        });
      const ref = pdf.context.register(annot);
      const annotsName = PDFName.of('Annots');
      const existing = link.page.node.has(annotsName) ? link.page.node.get(annotsName) : undefined;
      if (existing && typeof existing === 'object' && existing !== null && 'push' in existing) {
        (existing as { push: (r: unknown) => void }).push(ref);
      } else {
        link.page.node.set(annotsName, pdf.context.obj([ref]));
      }
    } catch {
      warnings.push(`Link-Annotation fehlgeschlagen: ${link.url}`);
    }
  }

  addOutlineTree(pdf, nestHeadings(headings));
  if (title) pdf.setTitle(title);
  if (options.author || doc.author) pdf.setAuthor(options.author ?? doc.author ?? '');
  const bytes = await pdf.save({ updateFieldAppearances: false });
  return { bytes, pageCount: pdf.getPageCount(), warnings };
}

function collectHeadingTitles(blocks: DocBlock[]): Array<{ title: string; level: number }> {
  const out: Array<{ title: string; level: number }> = [];
  for (const b of blocks) {
    if (b.type === 'heading') out.push({ title: runText(b.runs), level: b.level });
  }
  return out;
}

function hexRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return rgb(0, 0, 0);
  const n = parseInt(m[1]!, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

async function rasterKatex(tex: string): Promise<{ png: Uint8Array; width: number; height: number } | null> {
  if (typeof document === 'undefined') return null;
  try {
    const katex = await import('katex');
    const html = katex.default.renderToString(tex, { throwOnError: false, output: 'html' });
    const wrap = document.createElement('div');
    wrap.style.position = 'fixed';
    wrap.style.left = '-9999px';
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    const w = Math.max(wrap.offsetWidth, 8);
    const h = Math.max(wrap.offsetHeight, 8);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${html}</div></foreignObject></svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('katex svg'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/png');
    URL.revokeObjectURL(url);
    wrap.remove();
    const b64 = data.split(',')[1] ?? '';
    const bin = atob(b64);
    const png = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) png[i] = bin.charCodeAt(i);
    return { png, width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}

export async function renderPlainTextToPdf(text: string, options: PdfRenderOptions = {}): Promise<PdfRenderResult> {
  const blocks = text.split(/\n{2,}/).map((p) => ({
    type: 'paragraph' as const,
    runs: [{ text: p.replace(/\n/g, ' ') }],
  }));
  return renderDocToPdf({ title: options.title, blocks }, options);
}

void docPlainText;
