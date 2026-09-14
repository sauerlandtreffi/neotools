import { openPdfjsDocument } from '@neotools/tools-pdf';

export async function pdfPageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdf = await openPdfjsDocument(bytes);
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = (content.items as Array<{ str?: string; hasEOL?: boolean }>)
      .map((it) => `${it.str ?? ''}${it.hasEOL ? '\n' : ' '}`)
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    pages.push(text);
  }
  await pdf.destroy();
  return pages;
}

export function isPdfName(name: string, mime: string): boolean {
  return mime === 'application/pdf' || /\.pdf$/i.test(name);
}

export function isImageName(name: string, mime: string): boolean {
  return mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|tif{1,2})$/i.test(name);
}
