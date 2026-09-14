import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PixelCompareResult } from './pixel.js';
import type { TextCompareResult } from './text.js';

function winAnsiSafe(text: string): string {
  return text
    .replace(/[\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\t\n\r\u0020-\u007E\u00A0-\u00FF]/g, '?');
}

function wrap(text: string, font: { widthOfTextAtSize: (t: string, s: number) => number }, size: number, max: number): string[] {
  const words = winAnsiSafe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

export async function buildDiffPdf(
  text: TextCompareResult,
  pixel: PixelCompareResult | undefined,
  layout: 'side-by-side' | 'redline',
  names: { left: string; right: string },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  if (layout === 'side-by-side') {
    for (const pair of text.alignment) {
      const page = doc.addPage([842, 595]);
      const mid = 421;
      page.drawRectangle({ x: 0, y: 0, width: mid, height: 595, color: rgb(0.98, 0.98, 0.98) });
      page.drawText(winAnsiSafe(`${names.left} · ${pair.left ?? '-'}`), { x: 24, y: 560, size: 10, font: bold });
      page.drawText(winAnsiSafe(`${names.right} · ${pair.right ?? '-'}`), { x: mid + 24, y: 560, size: 10, font: bold });
      const leftText =
        pair.left === null
          ? ''
          : text.paragraphsLeft
              .filter((p) => p.page === pair.left)
              .map((p) => p.text)
              .join('\n');
      const rightText =
        pair.right === null
          ? ''
          : text.paragraphsRight
              .filter((p) => p.page === pair.right)
              .map((p) => p.text)
              .join('\n');
      const leftChanges = text.changes.filter((c) => c.pageLeft === pair.left);
      const rightChanges = text.changes.filter((c) => c.pageRight === pair.right);
      let yL = 530;
      for (const line of wrap(leftText || '(leer / entfernt)', font, 9, 370)) {
        const del = leftChanges.some((c) => c.kind !== 'insert' && (c.before ?? c.excerpt).includes(line.split(' ')[0] ?? ''));
        if (del) {
          page.drawRectangle({ x: 20, y: yL - 2, width: Math.min(370, font.widthOfTextAtSize(line, 9) + 4), height: 12, color: rgb(1, 0.8, 0.8) });
        }
        page.drawText(line, { x: 24, y: yL, size: 9, font, color: del ? rgb(0.7, 0, 0) : rgb(0.1, 0.1, 0.1) });
        yL -= 14;
        if (yL < 40) break;
      }
      let yR = 530;
      for (const line of wrap(rightText || '(leer / neu)', font, 9, 370)) {
        const ins = rightChanges.some((c) => c.kind !== 'delete' && (c.after ?? c.excerpt).includes(line.split(' ')[0] ?? ''));
        if (ins) {
          page.drawRectangle({ x: mid + 20, y: yR - 2, width: Math.min(370, font.widthOfTextAtSize(line, 9) + 4), height: 12, color: rgb(0.75, 0.95, 0.75) });
        }
        page.drawText(line, { x: mid + 24, y: yR, size: 9, font, color: ins ? rgb(0, 0.45, 0) : rgb(0.1, 0.1, 0.1) });
        yR -= 14;
        if (yR < 40) break;
      }
    }
  } else {
    const page = doc.addPage([595, 842]);
    page.drawText('Redline', { x: 40, y: 800, size: 16, font: bold });
    let y = 770;
    for (const change of text.changes) {
      const color =
        change.kind === 'insert' ? rgb(0, 0.45, 0) : change.kind === 'delete' ? rgb(0.75, 0, 0) : rgb(0.2, 0.2, 0.6);
      const prefix = change.kind === 'insert' ? '+' : change.kind === 'delete' ? '-' : '~';
      const block = wrap(`${prefix} ${change.excerpt}`, font, 10, 500);
      for (const line of block) {
        if (y < 50) break;
        if (change.kind === 'insert') {
          page.drawRectangle({ x: 36, y: y - 2, width: font.widthOfTextAtSize(line, 10) + 6, height: 13, color: rgb(0.8, 0.95, 0.8) });
        } else if (change.kind === 'delete') {
          page.drawRectangle({ x: 36, y: y - 2, width: font.widthOfTextAtSize(line, 10) + 6, height: 13, color: rgb(1, 0.82, 0.82) });
        }
        page.drawText(line, { x: 40, y, size: 10, font, color });
        if (change.kind === 'delete') {
          const w = font.widthOfTextAtSize(line, 10);
          page.drawLine({ start: { x: 40, y: y + 3 }, end: { x: 40 + w, y: y + 3 }, thickness: 0.8, color: rgb(0.75, 0, 0) });
        }
        y -= 16;
      }
      y -= 4;
      if (y < 50) break;
    }
  }

  if (pixel && !pixel.skipped) {
    for (const p of pixel.pages) {
      if (!p.heatmapPng) continue;
      const img = await doc.embedPng(p.heatmapPng);
      const page = doc.addPage([img.width, img.height + 28]);
      page.drawText(`Pixel-Diff L${p.pageLeft}/R${p.pageRight}  ${(p.changedRatio * 100).toFixed(2)}%  SSIM ${p.ssim.toFixed(3)}`, {
        x: 8,
        y: img.height + 10,
        size: 9,
        font,
      });
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
  }

  return new Uint8Array(await doc.save({ updateFieldAppearances: false }));
}
