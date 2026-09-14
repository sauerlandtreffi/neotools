import { localePath, type Locale } from '../lib/i18n';

export function landingHref(locale: Locale, dePath: string, enPath: string): string {
  return locale === 'de' ? dePath : enPath;
}

export function toolHref(locale: Locale, toolId: string): string {
  return localePath(locale, `/${toolId}`);
}

export const PACK_ORDER = [
  'pdf',
  'forensics',
  'image',
  'creator',
  'a11y',
  'dach',
  'office',
  'media',
  'speech',
  'archive',
] as const;

export type PackId = (typeof PACK_ORDER)[number];

export const PACK_META: Record<
  PackId,
  { de: string; en: string; hint: { de: string; en: string }; href: string }
> = {
  pdf: {
    de: 'PDF',
    en: 'PDF',
    hint: { de: 'Mergen, schwärzen, PDF/A, Signatur', en: 'Merge, redact, PDF/A, signatures' },
    href: '/pdf-merge',
  },
  forensics: {
    de: 'Forensik',
    en: 'Forensics',
    hint: { de: 'Identität, Hidden Data, Share-Safe', en: 'Identify, hidden data, share-safe' },
    href: '/forensics-identify',
  },
  image: {
    de: 'Bilder',
    en: 'Images',
    hint: { de: 'HEIC, Komprimieren, Metadaten', en: 'HEIC, compress, metadata' },
    href: '/image-convert',
  },
  creator: {
    de: 'Creator & Social',
    en: 'Creator & Social',
    hint: { de: 'Social-Cards, Audiogramme, Collagen', en: 'Social cards, audiograms, collages' },
    href: '/creator-social-card',
  },
  a11y: {
    de: 'KI und Barrierefreiheit',
    en: 'AI and accessibility',
    hint: { de: 'Hintergrund, Alt-Text, Doc-Repair', en: 'Background, alt text, doc repair' },
    href: '/image-remove-background',
  },
  dach: {
    de: 'DACH und Recht',
    en: 'DACH and law',
    hint: { de: 'beA, E-Rechnung, GoBD', en: 'beA, e-invoices, GoBD' },
    href: '/dach-bea-erv',
  },
  office: {
    de: 'Office',
    en: 'Office',
    hint: { de: 'DOCX, Markdown, Tabellen', en: 'DOCX, Markdown, spreadsheets' },
    href: '/docx-to-pdf',
  },
  media: {
    de: 'Video und Audio',
    en: 'Video and audio',
    hint: { de: 'Komprimieren, Normalisieren', en: 'Compress, normalize' },
    href: '/video-compress',
  },
  speech: {
    de: 'Sprache',
    en: 'Speech',
    hint: { de: 'Whisper, Untertitel lokal', en: 'Whisper, subtitles locally' },
    href: '/speech-transcribe',
  },
  archive: {
    de: 'Archive und Ordner',
    en: 'Archives and folders',
    hint: { de: 'ZIP prüfen, Duplikate', en: 'Inspect ZIP, find duplicates' },
    href: '/archive-inspect',
  },
};

export function packLabel(locale: Locale, pack: string): string {
  const known = PACK_META[pack as PackId];
  if (known) return known[locale];
  return pack;
}
