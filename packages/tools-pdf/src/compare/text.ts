import { diffWords } from 'diff';
import { openPdfjsDocument } from '../pdfjs.js';

export interface TextGlyph {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Paragraph {
  page: number;
  text: string;
  y: number;
  hash: string;
  glyphs: TextGlyph[];
}

export interface WordChange {
  kind: 'insert' | 'delete' | 'replace';
  pageLeft?: number;
  pageRight?: number;
  excerpt: string;
  before?: string;
  after?: string;
}

export interface TextCompareResult {
  leftPages: number;
  rightPages: number;
  paragraphsLeft: Paragraph[];
  paragraphsRight: Paragraph[];
  alignment: Array<{ left: number | null; right: number | null }>;
  changes: WordChange[];
  paragraphsRemoved: number;
  paragraphsAdded: number;
  pagesAdded: number[];
  pagesRemoved: number[];
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function groupLines(glyphs: TextGlyph[]): TextGlyph[][] {
  const sorted = [...glyphs].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextGlyph[][] = [];
  const tol = 3;
  for (const g of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0]!.y - g.y) <= tol) last.push(g);
    else lines.push([g]);
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}

function linesToParagraphs(page: number, glyphs: TextGlyph[]): Paragraph[] {
  const lines = groupLines(glyphs);
  const paras: Paragraph[] = [];
  let buf: TextGlyph[] = [];
  let lastY: number | undefined;
  const flush = () => {
    if (!buf.length) return;
    const text = normalize(buf.map((g) => g.str).join(''));
    if (!text) {
      buf = [];
      return;
    }
    paras.push({
      page,
      text,
      y: buf[0]!.y,
      hash: fnv1a(text.toLowerCase()),
      glyphs: buf,
    });
    buf = [];
  };
  for (const line of lines) {
    const y = line[0]!.y;
    const gap = lastY === undefined ? 0 : lastY - y;
    const lineH = line[0]!.h || 12;
    if (lastY !== undefined && gap > lineH * 1.6) flush();
    buf.push(...line);
    lastY = y;
  }
  flush();
  return paras;
}

async function extractPages(bytes: Uint8Array): Promise<{ pages: number; paragraphs: Paragraph[] }> {
  const pdf = await openPdfjsDocument(bytes);
  const paragraphs: Paragraph[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const glyphs: TextGlyph[] = [];
    for (const raw of content.items) {
      const item = raw as { str?: string; width?: number; height?: number; transform?: number[] };
      const str = item.str ?? '';
      if (!str) continue;
      const t = item.transform ?? [1, 0, 0, 1, 0, 0];
      glyphs.push({
        str,
        x: t[4] ?? 0,
        y: t[5] ?? 0,
        w: item.width ?? str.length * 6,
        h: item.height ?? Math.abs(t[3] ?? 12),
      });
    }
    paragraphs.push(...linesToParagraphs(i, glyphs));
  }
  const pages = pdf.numPages;
  await pdf.destroy();
  return { pages, paragraphs };
}

function pageHashes(paras: Paragraph[], pageCount: number): string[] {
  const byPage = new Map<number, string[]>();
  for (const p of paras) {
    const list = byPage.get(p.page) ?? [];
    list.push(p.hash);
    byPage.set(p.page, list);
  }
  const out: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    out.push((byPage.get(i) ?? []).join('|'));
  }
  return out;
}

/** LCS of identical page hashes, then zip leftover gaps as edited pairs (page shift + in-place edits). */
export function alignPages(left: string[], right: string[]): Array<{ left: number | null; right: number | null }> {
  const n = left.length;
  const m = right.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => 0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = left[i] === right[j] ? 1 + dp[i + 1]![j + 1]! : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const exact: Array<{ left: number; right: number }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      exact.push({ left: i + 1, right: j + 1 });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i += 1;
    } else {
      j += 1;
    }
  }

  const pairs: Array<{ left: number | null; right: number | null }> = [];
  const zipGap = (leftPages: number[], rightPages: number[]) => {
    const len = Math.max(leftPages.length, rightPages.length);
    for (let k = 0; k < len; k++) {
      pairs.push({ left: leftPages[k] ?? null, right: rightPages[k] ?? null });
    }
  };
  let li = 1;
  let ri = 1;
  for (const match of exact) {
    const leftGap: number[] = [];
    const rightGap: number[] = [];
    while (li < match.left) leftGap.push(li++);
    while (ri < match.right) rightGap.push(ri++);
    zipGap(leftGap, rightGap);
    pairs.push({ left: match.left, right: match.right });
    li = match.left + 1;
    ri = match.right + 1;
  }
  const leftTail: number[] = [];
  const rightTail: number[] = [];
  while (li <= n) leftTail.push(li++);
  while (ri <= m) rightTail.push(ri++);
  zipGap(leftTail, rightTail);
  return pairs;
}

function pageText(paras: Paragraph[], page: number): string {
  return paras
    .filter((p) => p.page === page)
    .map((p) => p.text)
    .join('\n');
}

function wordChangesForPages(
  leftText: string,
  rightText: string,
  pageLeft: number | undefined,
  pageRight: number | undefined,
): WordChange[] {
  const parts = diffWords(leftText, rightText);
  const changes: WordChange[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part.added) {
      const prev = parts[i - 1];
      if (prev?.removed) continue;
      changes.push({
        kind: 'insert',
        pageLeft,
        pageRight,
        excerpt: part.value.trim(),
        after: part.value.trim(),
      });
    } else if (part.removed) {
      const next = parts[i + 1];
      if (next?.added) {
        changes.push({
          kind: 'replace',
          pageLeft,
          pageRight,
          excerpt: `${part.value.trim()} → ${next.value.trim()}`,
          before: part.value.trim(),
          after: next.value.trim(),
        });
        i += 1;
      } else {
        changes.push({
          kind: 'delete',
          pageLeft,
          pageRight,
          excerpt: part.value.trim(),
          before: part.value.trim(),
        });
      }
    }
  }
  return changes.filter((c) => (c.excerpt || c.before || c.after)?.length);
}

export async function comparePdfText(leftBytes: Uint8Array, rightBytes: Uint8Array): Promise<TextCompareResult> {
  const left = await extractPages(leftBytes);
  const right = await extractPages(rightBytes);
  const alignment = alignPages(pageHashes(left.paragraphs, left.pages), pageHashes(right.paragraphs, right.pages));
  const changes: WordChange[] = [];
  const pagesAdded: number[] = [];
  const pagesRemoved: number[] = [];
  let paragraphsRemoved = 0;
  let paragraphsAdded = 0;

  for (const pair of alignment) {
    if (pair.left !== null && pair.right !== null) {
      const l = pageText(left.paragraphs, pair.left);
      const r = pageText(right.paragraphs, pair.right);
      changes.push(...wordChangesForPages(l, r, pair.left, pair.right));
    } else if (pair.left !== null && pair.right === null) {
      pagesRemoved.push(pair.left);
      const paras = left.paragraphs.filter((p) => p.page === pair.left);
      paragraphsRemoved += paras.length;
      const text = pageText(left.paragraphs, pair.left);
      if (text) {
        changes.push({
          kind: 'delete',
          pageLeft: pair.left,
          excerpt: text.slice(0, 240),
          before: text,
        });
      }
    } else if (pair.right !== null && pair.left === null) {
      pagesAdded.push(pair.right);
      const paras = right.paragraphs.filter((p) => p.page === pair.right);
      paragraphsAdded += paras.length;
      const text = pageText(right.paragraphs, pair.right);
      if (text) {
        changes.push({
          kind: 'insert',
          pageRight: pair.right,
          excerpt: text.slice(0, 240),
          after: text,
        });
      }
    }
  }

  return {
    leftPages: left.pages,
    rightPages: right.pages,
    paragraphsLeft: left.paragraphs,
    paragraphsRight: right.paragraphs,
    alignment,
    changes,
    paragraphsRemoved,
    paragraphsAdded,
    pagesAdded,
    pagesRemoved,
  };
}
