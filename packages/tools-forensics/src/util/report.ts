import { MIME, neoFileFromBytes } from '@neotools/engine';
import type { Locale, Localized, NeoFile } from '@neotools/engine';
import { utf8 } from './bytes.js';

export const MIME_MD = 'text/markdown';

export function loc(locale: Locale, text: Localized): string {
  return text[locale];
}

export function L(de: string, en: string): Localized {
  return { de, en };
}

export function reportFiles(stem: string, json: unknown, markdown: string): NeoFile[] {
  return [
    neoFileFromBytes(`${stem}.json`, utf8(JSON.stringify(json, null, 2)), MIME.json),
    neoFileFromBytes(`${stem}.md`, utf8(markdown), MIME_MD),
  ];
}

export function mdHeading(title: string, level = 1): string {
  return `${'#'.repeat(level)} ${title}\n`;
}

export function mdKv(rows: Array<[string, unknown]>): string {
  return rows
    .map(([k, v]) => `- **${k}:** ${formatMdValue(v)}`)
    .join('\n');
}

export function formatMdValue(v: unknown): string {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'object') return `\`${JSON.stringify(v)}\``;
  return String(v);
}

export function localeOption(defaultLocale: Locale = 'de') {
  return defaultLocale;
}
