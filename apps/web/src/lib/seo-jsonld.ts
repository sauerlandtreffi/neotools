import type { Locale } from './i18n';
import type { ConversionEdge, FormatRecord } from '../data/formats';
import type { FaqItem } from './format-faq';

export function breadcrumbList(_locale: Locale, site: URL, crumbs: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: new URL(crumb.path, site).toString(),
    })),
  };
}

export function faqPage(locale: Locale, items: readonly FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q[locale],
      acceptedAnswer: { '@type': 'Answer', text: item.a[locale] },
    })),
  };
}

export function techArticle(locale: Locale, format: FormatRecord, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: format.names[locale],
    description: format.typicalUse[locale],
    datePublished: String(format.year),
    url,
  };
}

export function howToConvert(locale: Locale, from: FormatRecord, to: FormatRecord, edge: ConversionEdge, url: string) {
  const name =
    locale === 'de'
      ? `${from.names.de} nach ${to.names.de} konvertieren`
      : `Convert ${from.names.en} to ${to.names.en}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    url,
    description:
      locale === 'de'
        ? `Lokal im Browser: ${from.id} → ${to.id}${edge.toolId ? ` mit ${edge.toolId}` : ''}.`
        : `Locally in the browser: ${from.id} → ${to.id}${edge.toolId ? ` with ${edge.toolId}` : ''}.`,
    step: [
      {
        '@type': 'HowToStep',
        name: locale === 'de' ? 'Datei legen' : 'Drop the file',
        text: locale === 'de' ? 'Datei in die Fläche ziehen. Nichts wird hochgeladen.' : 'Drop the file. Nothing is uploaded.',
      },
      {
        '@type': 'HowToStep',
        name: locale === 'de' ? 'Optionen' : 'Options',
        text: locale === 'de' ? 'Preset oder Format prüfen.' : 'Check the preset or format.',
      },
      {
        '@type': 'HowToStep',
        name: locale === 'de' ? 'Ausführen' : 'Run',
        text: locale === 'de' ? 'Lokal verarbeiten und Ergebnis laden.' : 'Process locally and download the result.',
      },
    ],
  };
}
