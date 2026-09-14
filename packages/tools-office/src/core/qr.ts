import QRCode from 'qrcode';
import { parseCsv } from './textdata.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { utf8 } from '../util/bytes.js';

export type BarcodeKind = 'qr' | 'code128' | 'ean13' | 'datamatrix';

export interface QrItem {
  text: string;
  label?: string;
}

export function itemsFromCsv(text: string, column = 0): QrItem[] {
  const { rows } = parseCsv(text);
  const start = rows[0]?.some((c) => /text|code|value|payload/i.test(c)) ? 1 : 0;
  return rows.slice(start).map((r) => ({
    text: (r[column] ?? '').trim(),
    label: (r[1] ?? r[0] ?? '').trim(),
  })).filter((i) => i.text);
}

export async function encodeBarcode(kind: BarcodeKind, text: string, format: 'png' | 'svg'): Promise<Uint8Array> {
  if (kind === 'qr') {
    if (format === 'svg') return utf8(await QRCode.toString(text, { type: 'svg', margin: 1 }));
    const buf = await QRCode.toBuffer(text, { type: 'png', margin: 1, width: 256 });
    return new Uint8Array(buf);
  }
  const bwip = await import('bwip-js');
  const bcid = kind === 'code128' ? 'code128' : kind === 'ean13' ? 'ean13' : 'datamatrix';
  if (format === 'svg') {
    const svg = bwip.toSVG({ bcid, text, scale: 3, includetext: true });
    return utf8(typeof svg === 'string' ? svg : String(svg));
  }
  const png = await bwip.toBuffer({ bcid, text, scale: 3, includetext: true });
  return new Uint8Array(png);
}

export async function sheetPdf(items: QrItem[], kind: BarcodeKind): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const cols = 3;
  const rows = 4;
  const per = cols * rows;
  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 36;
  const cellW = (pageW - margin * 2) / cols;
  const cellH = (pageH - margin * 2) / rows;
  for (let i = 0; i < items.length; i += per) {
    const page = pdf.addPage([pageW, pageH]);
    const chunk = items.slice(i, i + per);
    for (let j = 0; j < chunk.length; j++) {
      const item = chunk[j]!;
      const col = j % cols;
      const row = Math.floor(j / cols);
      const x = margin + col * cellW;
      const y = pageH - margin - (row + 1) * cellH;
      try {
        const png = await encodeBarcode(kind, item.text, 'png');
        const img = await pdf.embedPng(png);
        const fit = Math.min(cellW - 16, cellH - 28);
        page.drawImage(img, { x: x + (cellW - fit) / 2, y: y + 18, width: fit, height: fit });
      } catch {
        page.drawRectangle({ x: x + 8, y: y + 18, width: cellW - 16, height: cellH - 36, borderColor: rgb(0.8, 0.2, 0.2), borderWidth: 1 });
      }
      page.drawText((item.label ?? item.text).slice(0, 40), {
        x: x + 8,
        y: y + 6,
        size: 8,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
    }
  }
  if (!items.length) pdf.addPage([pageW, pageH]);
  return pdf.save({ updateFieldAppearances: false });
}

export async function readBarcodesFromBytes(bytes: Uint8Array): Promise<string[]> {
  try {
    const { readBarcodes } = await import('zxing-wasm');
    const results = await readBarcodes(bytes);
    return results.map((r) => r.text).filter(Boolean);
  } catch {
    return [];
  }
}
