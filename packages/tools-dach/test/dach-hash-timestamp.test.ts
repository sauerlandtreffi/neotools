import { describe, expect, it } from 'vitest';
import { MIME, createToolContext, neoFileFromBytes } from '@neotools/engine';
import { dachHashTimestamp } from '../src/tools/dach-hash-timestamp.js';

describe('dach-hash-timestamp', () => {
  it('writes a manifest with sha256/sha512', async () => {
    const file = neoFileFromBytes('note.txt', new TextEncoder().encode('hello-neotools'), MIME.txt);
    const result = await dachHashTimestamp.run(createToolContext(), [file], {
      mode: 'hash',
      algorithms: ['sha256', 'sha512'],
      tsaUrl: '',
      locale: 'de',
    });
    const json = result.outputs.find((o) => o.name.endsWith('.json'));
    expect(json).toBeTruthy();
    const manifest = JSON.parse(new TextDecoder().decode(await json!.bytes())) as {
      files: Array<{ sha256?: string; sha512?: string }>;
    };
    expect(manifest.files[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.files[0]?.sha512).toMatch(/^[0-9a-f]{128}$/);
    expect(result.outputs.some((o) => o.name === 'nachweisblatt.pdf')).toBe(true);
  });
});
