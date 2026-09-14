import { rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type ExhibitPrefix = 'K' | 'B' | string;

export function formatExhibitStamp(opts: {
  prefix: ExhibitPrefix;
  index: number;
  aktenzeichen: string;
}): string {
  const label = `${opts.prefix}${opts.index}`;
  return opts.aktenzeichen ? `Anlage ${label} zu Az. ${opts.aktenzeichen}` : `Anlage ${label}`;
}

export function drawExhibitStamp(
  page: PDFPage,
  font: PDFFont,
  text: string,
  opts: { x: 'left' | 'center' | 'right'; y: 'top' | 'bottom'; size: number; frame: boolean },
): void {
  const { width, height } = page.getSize();
  const pad = 28;
  const tw = font.widthOfTextAtSize(text, opts.size);
  let x = pad;
  if (opts.x === 'center') x = (width - tw) / 2;
  if (opts.x === 'right') x = width - pad - tw;
  const y = opts.y === 'top' ? height - pad - opts.size : pad;
  if (opts.frame) {
    page.drawRectangle({
      x: x - 6,
      y: y - 4,
      width: tw + 12,
      height: opts.size + 8,
      borderColor: rgb(0.35, 0.15, 0.1),
      borderWidth: 0.8,
    });
  }
  page.drawText(text, { x, y, size: opts.size, font, color: rgb(0.35, 0.15, 0.1) });
}
