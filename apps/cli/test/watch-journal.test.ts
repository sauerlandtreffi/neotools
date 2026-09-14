import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileHash, WatchJournal } from '../src/watch-journal.js';

describe('Watch journal idempotency', () => {
  it('skips a hash that was already recorded (tmp journal)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'neotools-watch-'));
    const journalPath = join(dir, '.neotools-watch.jsonl');
    const journal = new WatchJournal(journalPath);
    await journal.load();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const hash = fileHash(bytes);
    expect(journal.has(hash)).toBe(false);
    await journal.record({
      hash,
      path: join(dir, 'a.pdf'),
      processedAt: new Date().toISOString(),
      status: 'ok',
    });
    const again = new WatchJournal(journalPath);
    await again.load();
    expect(again.has(hash)).toBe(true);
    expect(again.get(hash)?.status).toBe('ok');
    await writeFile(join(dir, 'a.pdf'), bytes);
    expect(fileHash(bytes)).toBe(hash);
  });
});
