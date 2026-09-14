import { rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type StampPosition =
  | 'footer-center'
  | 'footer-left'
  | 'footer-right'
  | 'header-center'
  | 'header-left'
  | 'header-right';

export interface StampStyle {
  position: StampPosition;
  fontSize: number;
  pad?: number;
  color?: { r: number; g: number; b: number };
}

export function stampCoordinates(
  position: StampPosition,
  pageWidth: number,
  pageHeight: number,
  textWidth: number,
  fontSize: number,
  pad = 28,
): { x: number; y: number } {
  let x = (pageWidth - textWidth) / 2;
  let y = pad;
  if (position === 'footer-left' || position === 'header-left') x = pad;
  if (position === 'footer-right' || position === 'header-right') x = pageWidth - pad - textWidth;
  if (position.startsWith('header-')) y = pageHeight - pad - fontSize;
  return { x, y };
}

export function formatPageLabel(template: string, n: number, total: number): string {
  return template.replaceAll('{n}', String(n)).replaceAll('{total}', String(total));
}

export function padBates(n: number, digits: number): string {
  return String(n).padStart(Math.max(1, digits), '0');
}

export function drawPageStamp(
  page: PDFPage,
  font: PDFFont,
  text: string,
  style: StampStyle,
): void {
  const { width, height } = page.getSize();
  const textW = font.widthOfTextAtSize(text, style.fontSize);
  const { x, y } = stampCoordinates(style.position, width, height, textW, style.fontSize, style.pad);
  const c = style.color ?? { r: 0.2, g: 0.2, b: 0.2 };
  page.drawText(text, {
    x,
    y,
    size: style.fontSize,
    font,
    color: rgb(c.r, c.g, c.b),
  });
}
