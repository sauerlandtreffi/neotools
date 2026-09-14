import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createMemoryHistoryStore, HistoryStore, journalCsv, journalJsonl } from '../src/lib/history';
import { idbBlobStore, idbMetaStore } from '../src/lib/history/idb';

const sample = (name: string, fill = 7) => ({
  name,
  mime: 'application/pdf',
  data: new Uint8Array([fill, fill, fill]),
});

describe('history store', () => {
  it('stores outputs, optional inputs, and evicts oldest first', async () => {
    const store = createMemoryHistoryStore({
      keepInputs: true,
      ttlMs: 24 * 3600 * 1000,
      maxBytes: 10,
    });
    const first = await store.save({
      toolId: 'pdf-merge',
      options: { outline: true },
      inputs: [sample('a.pdf', 1)],
      outputs: [sample('out.pdf', 2)],
    });
    await store.save({
      toolId: 'pdf-split',
      options: {},
      inputs: [sample('b.pdf', 3)],
      outputs: [sample('b-1.pdf', 4)],
    });
    const list = await store.list();
    expect(list.some((row) => row.id === first.id)).toBe(false);
    expect(list[0]?.toolId).toBe('pdf-split');
    const blob = await store.readBlob(list[0]!.outputs[0]!);
    expect(blob?.byteLength).toBe(3);
  });

  it('expires records and can drop input bytes', async () => {
    let now = 1_000;
    const store = new HistoryStore({
      meta: (await import('../src/lib/history/memory')).memoryMetaStore({
        keepInputs: false,
        ttlMs: 10,
        maxBytes: 200 * 1024 * 1024,
      }),
      blobs: (await import('../src/lib/history/memory')).memoryBlobStore(),
      now: () => now,
    });
    const record = await store.save({
      toolId: 'pdf-sanitize',
      options: {},
      inputs: [sample('in.pdf')],
      outputs: [sample('out.pdf')],
    });
    expect(record.inputs[0]?.stored).toBe(false);
    expect(await store.readBlob(record.inputs[0]!)).toBeUndefined();
    now = 2_000;
    expect(await store.purgeExpired(now)).toBe(1);
    expect(await store.list()).toHaveLength(0);
  });

  it('exports a journal without file bytes', async () => {
    const store = createMemoryHistoryStore();
    await store.save({
      toolId: 'pdf-redact',
      options: { mode: 'auto' },
      inputs: [sample('secret.pdf')],
      outputs: [sample('clean.pdf')],
      report: { verification: { passed: true } },
    });
    const rows = await store.list();
    const jsonl = journalJsonl(rows);
    const csv = journalCsv(rows);
    expect(jsonl).toContain('pdf-redact');
    expect(jsonl).not.toContain('secret-bytes');
    expect(csv).toContain('inputHashes');
    expect([...csv].some((ch) => ch.charCodeAt(0) >= 1 && ch.charCodeAt(0) <= 6)).toBe(false);
  });

  it('persists metadata through IndexedDB (fake-indexeddb)', async () => {
    const store = new HistoryStore({
      meta: idbMetaStore(),
      blobs: idbBlobStore(),
    });
    const saved = await store.save({
      toolId: 'pdf-merge',
      options: {},
      inputs: [sample('a.pdf')],
      outputs: [sample('b.pdf')],
    });
    const again = new HistoryStore({ meta: idbMetaStore(), blobs: idbBlobStore() });
    const found = await again.get(saved.id);
    expect(found?.toolId).toBe('pdf-merge');
    const bytes = await again.readBlob(found!.outputs[0]!);
    expect(bytes?.byteLength).toBe(3);
  });
});
