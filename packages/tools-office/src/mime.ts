export const OFFICE_MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  epub: 'application/epub+zip',
  csv: 'text/csv',
  html: 'text/html',
  yaml: 'application/yaml',
  xml: 'application/xml',
  vcf: 'text/vcard',
  ics: 'text/calendar',
  zip: 'application/zip',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  apkg: 'application/octet-stream',
} as const;

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

export function looksLike(name: string, mime: string, ...exts: string[]): boolean {
  const e = extOf(name);
  if (exts.includes(e)) return true;
  return exts.some((ext) => mime.toLowerCase().includes(ext.replace('.', '')));
}
