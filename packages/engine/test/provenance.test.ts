import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createProvenance, sha256 } from '../src/provenance.js';
import { dummyPdf } from './helpers.js';

describe('Provenance hash', () => {
  it('matches Node crypto for empty and sample payloads', async () => {
    for (const s of ['', 'neotools', 'pdf-lib']) {
      const data = new TextEncoder().encode(s);
      const expected = createHash('sha256').update(data).digest('hex');
      expect(await sha256(data)).toBe(expected);
    }
  });

  it('embeds toolId, options and source hashes', async () => {
    const file = dummyPdf('a.pdf', 'source-bytes');
    const manifest = await createProvenance('pdf-merge', { bookmarkPerFile: true }, [file], '0.1.0');
    expect(manifest.toolId).toBe('pdf-merge');
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.options).toEqual({ bookmarkPerFile: true });
    expect(manifest.sourceSha256).toHaveLength(1);
    expect(manifest.sourceSha256[0]).toBe(await sha256(await file.bytes()));
    expect(Number.isNaN(Date.parse(manifest.timestamp))).toBe(false);
  });
});
