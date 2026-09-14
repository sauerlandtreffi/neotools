import { openPdfjsDocument } from '../pdfjs.js';
import type { PageTextMap, RedactRegion, TextItemBox } from './types.js';

interface PdfjsTextItem {
  str?: string;
  width?: number;
  height?: number;
  transform?: number[];
  hasEOL?: boolean;
}

export function boxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  pad = 1,
): boolean {
  return (
    a.x < b.x + b.w + pad &&
    a.x + a.w + pad > b.x &&
    a.y < b.y + b.h + pad &&
    a.y + a.h + pad > b.y
  );
}

export function itemBox(page: number, item: PdfjsTextItem, start: number): TextItemBox | null {
  const str = item.str ?? '';
  if (!str) return null;
  const t = item.transform ?? [1, 0, 0, 1, 0, 0];
  const x = t[4] ?? 0;
  const y = t[5] ?? 0;
  const w = item.width ?? str.length * 6;
  const h = item.height ?? Math.abs(t[3] ?? 12);
  return { page, str, x, y, w, h, start, end: start + str.length };
}

export function buildPageTextMap(page: number, items: PdfjsTextItem[]): PageTextMap {
  const boxes: TextItemBox[] = [];
  let text = '';
  for (const item of items) {
    const box = itemBox(page, item, text.length);
    if (!box) {
      if (item.hasEOL) text += '\n';
      continue;
    }
    boxes.push(box);
    text += box.str;
    if (item.hasEOL) text += '\n';
  }

  const compactToOffset: number[] = [];
  let compact = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (/\s/.test(ch)) continue;
    compactToOffset.push(i);
    compact += ch;
  }

  return { page, text, compact, compactToOffset, items: boxes };
}

export function itemsForRange(map: PageTextMap, start: number, end: number): TextItemBox[] {
  return map.items.filter((it) => it.start < end && it.end > start);
}

export function unionBox(items: TextItemBox[]): { x: number; y: number; w: number; h: number } | null {
  if (!items.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    minX = Math.min(minX, it.x);
    minY = Math.min(minY, it.y);
    maxX = Math.max(maxX, it.x + it.w);
    maxY = Math.max(maxY, it.y + it.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function itemsOverlappingRegion(map: PageTextMap, region: RedactRegion): TextItemBox[] {
  return map.items.filter((it) =>
    boxesOverlap(it, { x: region.x, y: region.y, w: region.w, h: region.h }, 2),
  );
}

export async function extractPageMaps(data: Uint8Array): Promise<PageTextMap[]> {
  const pdf = await openPdfjsDocument(data);
  const maps: PageTextMap[] = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      maps.push(buildPageTextMap(i, content.items as PdfjsTextItem[]));
    }
  } finally {
    await pdf.destroy();
  }
  return maps;
}

export async function extractAllText(data: Uint8Array): Promise<{ pages: string[]; joined: string }> {
  const maps = await extractPageMaps(data);
  const pages = maps.map((m) => m.text);
  return { pages, joined: pages.join('\n') };
}
