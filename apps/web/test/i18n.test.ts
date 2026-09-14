import { describe, expect, it } from 'vitest';
import { localePath, t } from '../src/lib/i18n';

describe('i18n routing', () => {
  it('keeps German unprefixed and prefixes English', () => {
    expect(localePath('de', '/pdf-merge')).toBe('/pdf-merge');
    expect(localePath('en', '/pdf-merge')).toBe('/en/pdf-merge');
    expect(localePath('en', '/')).toBe('/en');
  });

  it('returns German UI copy', () => {
    expect(t('de', 'localBadge')).toMatch(/Lokal/);
  });
});
