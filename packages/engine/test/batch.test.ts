import { describe, expect, it } from 'vitest';
import { mapFiles } from '../src/batch.js';
import { dummyPdf } from './helpers.js';

describe('Batch error protocol', () => {
  it('continues after a failing file and records ok|error', async () => {
    const files = [dummyPdf('good.pdf'), dummyPdf('bad.pdf'), dummyPdf('also-good.pdf')];
    const { ok, errors, protocol } = await mapFiles(files, async (file) => {
      if (file.name.includes('bad')) throw new Error('beschädigt');
      return file.name.toUpperCase();
    });
    expect(ok.map((r) => r.file.name)).toEqual(['good.pdf', 'also-good.pdf']);
    expect(errors).toEqual([{ file: 'bad.pdf', status: 'error', reason: 'beschädigt' }]);
    expect(protocol).toEqual([
      { file: 'good.pdf', status: 'ok' },
      { file: 'bad.pdf', status: 'error', reason: 'beschädigt' },
      { file: 'also-good.pdf', status: 'ok' },
    ]);
  });

  it('never throws when a mapper rejects', async () => {
    await expect(
      mapFiles([dummyPdf('a.pdf')], async () => {
        throw new Error('boom');
      }),
    ).resolves.toMatchObject({ ok: [], errors: [{ status: 'error', reason: 'boom' }] });
  });
});
