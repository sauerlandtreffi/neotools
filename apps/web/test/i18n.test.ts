import { describe, expect, it } from 'vitest';
import { guideSlugFromId } from '../src/lib/guides';
import { hreflangUrls, localePath, switchLocalePath, t } from '../src/lib/i18n';

describe('i18n routing', () => {
  it('keeps German unprefixed and prefixes English', () => {
    expect(localePath('de', '/pdf-merge')).toBe('/pdf-merge');
    expect(localePath('en', '/pdf-merge')).toBe('/en/pdf-merge');
    expect(localePath('en', '/')).toBe('/en');
  });

  it('returns German UI copy', () => {
    expect(t('de', 'localBadge')).toMatch(/Lokal/);
  });

  it('pairs aliased routes for hreflang', () => {
    expect(hreflangUrls('de', '/verlauf')).toEqual({ de: '/verlauf', en: '/en/history' });
    expect(hreflangUrls('en', '/history')).toEqual({ de: '/verlauf', en: '/en/history' });
    expect(hreflangUrls('de', '/formats/jpg')).toEqual({ de: '/formats/jpg', en: '/en/formats/jpg' });
    expect(switchLocalePath('/lizenzen', 'de')).toBe('/en/licenses');
  });
});

describe('guide slugs', () => {
  it('strips locale from content-layer ids that dropped the dot', () => {
    expect(guideSlugFromId('mergede', 'de')).toBe('merge');
    expect(guideSlugFromId('heic-jpgde', 'de')).toBe('heic-jpg');
    expect(guideSlugFromId('heic-jpgen', 'en')).toBe('heic-jpg');
    expect(guideSlugFromId('merge.de', 'de')).toBe('merge');
    expect(guideSlugFromId('guides/pdfa.de.md', 'de')).toBe('pdfa');
  });
});
