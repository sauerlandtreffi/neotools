import type { Locale } from './i18n';
import { localePath } from './i18n';

export interface PaletteSourceTool {
  id: string;
  title: Record<Locale, string>;
  description: Record<Locale, string>;
}

export interface PaletteSourceFormat {
  id: string;
  names: Record<Locale, string>;
}

export interface PaletteSourceGuide {
  slug: string;
  title: string;
}

export function buildPaletteItems(
  locale: Locale,
  tools: readonly PaletteSourceTool[],
  formats: readonly PaletteSourceFormat[],
  guides: readonly PaletteSourceGuide[],
): Array<{ href: string; title: string; hint?: string; group: string }> {
  const pages = [
    { href: localePath(locale, '/'), title: locale === 'de' ? 'Start' : 'Home', group: 'page' },
    { href: localePath(locale, locale === 'de' ? '/verlauf' : '/history'), title: locale === 'de' ? 'Verlauf' : 'History', group: 'page' },
    { href: localePath(locale, '/formats'), title: locale === 'de' ? 'Formate' : 'Formats', group: 'page' },
    { href: localePath(locale, '/guides'), title: locale === 'de' ? 'Anleitungen' : 'Guides', group: 'page' },
    { href: localePath(locale, '/spec'), title: locale === 'de' ? 'Plattform-Limits' : 'Platform limits', group: 'page' },
    { href: localePath(locale, '/pipeline'), title: 'Pipeline', group: 'page' },
    { href: localePath(locale, '/no-upload'), title: locale === 'de' ? 'Kein Upload' : 'No upload', group: 'page' },
    { href: localePath(locale, locale === 'de' ? '/lizenzen' : '/licenses'), title: locale === 'de' ? 'Lizenzen' : 'Licenses', group: 'page' },
  ];
  return [
    ...pages,
    ...tools.map((tool) => ({
      href: localePath(locale, `/${tool.id}`),
      title: tool.title[locale],
      hint: tool.id,
      group: 'tool',
    })),
    ...formats.map((format) => ({
      href: localePath(locale, `/formats/${format.id}`),
      title: format.names[locale],
      hint: format.id,
      group: 'format',
    })),
    ...guides.map((guide) => ({
      href: localePath(locale, `/guides/${guide.slug}`),
      title: guide.title,
      group: 'guide',
    })),
  ];
}
