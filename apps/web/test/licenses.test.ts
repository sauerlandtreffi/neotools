import { describe, expect, it } from 'vitest';
import { Registry, defineTool } from '@neotools/engine';
import { z } from 'zod';
import { aggregateLicenses, groupLicenses, licenseKey, thirdPartyNotices } from '../src/lib/licenses-view';
import { registry } from '../src/lib/registry';

const stub = (id: string, licenses: Array<{ name: string; license: string; url: string }>) =>
  defineTool({
    id,
    pack: 'pdf',
    category: 'pdf',
    title: { de: id, en: id },
    description: { de: id, en: id },
    inputs: { accept: ['application/pdf'], multiple: false },
    options: z.object({}),
    licenses,
    async run() {
      return { outputs: [], warnings: [] };
    },
  });

describe('license aggregation', () => {
  it('dedupes by name+license', () => {
    const fake = new Registry();
    fake.register(
      stub('one', [
        { name: 'pdf-lib', license: 'MIT', url: 'https://example.test/a' },
        { name: 'pdf-lib', license: 'MIT', url: 'https://example.test/a' },
      ]),
    );
    fake.register(stub('two', [{ name: 'pdf-lib', license: 'MIT', url: 'https://example.test/b' }]));
    const items = aggregateLicenses(fake, []);
    expect(items.filter((i) => i.name === 'pdf-lib')).toHaveLength(1);
    expect(new Set(items.map(licenseKey)).size).toBe(items.length);
  });

  it('groups copyleft separately and writes a notices file', () => {
    const items = [
      { name: 'Preact', license: 'MIT', url: 'https://example.test/preact' },
      { name: 'ffmpeg.wasm', license: 'LGPL-2.1-or-later', url: 'https://example.test/ffmpeg' },
    ];
    const groups = groupLicenses(items);
    expect(groups.permissive).toHaveLength(1);
    expect(groups.copyleft).toHaveLength(1);
    expect(thirdPartyNotices(items)).toContain('ffmpeg.wasm');
    expect(thirdPartyNotices(items)).toContain('LGPL');
  });

  it('collects the live registry without duplicate keys', () => {
    const items = aggregateLicenses(registry);
    expect(items.length).toBeGreaterThan(3);
    expect(new Set(items.map(licenseKey)).size).toBe(items.length);
  });
});
