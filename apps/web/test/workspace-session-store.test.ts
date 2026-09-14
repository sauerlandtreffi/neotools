import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { opfsBlobStore, opfsRemoveTree } from '../src/lib/history/opfs';
import {
  SessionStore,
  createMemorySessionStore,
  defaultSessionName,
  idbSessionMetaStore,
  opfsPathOf,
  revKey,
  srcKey,
} from '../src/lib/workspace/session-store';
import { newStepRecord } from '../src/lib/workspace/step-stack';
import type { StepRecord } from '../src/lib/workspace/types';

/* ------------------------------------------------------------------ */
/* Minimal in-memory OPFS (navigator.storage.getDirectory) for tests.   */
/* ------------------------------------------------------------------ */
class FakeFile {
  constructor(public data: Uint8Array) {}
}
class FakeDir {
  readonly kind = 'directory' as const;
  files = new Map<string, FakeFile>();
  dirs = new Map<string, FakeDir>();
  constructor(public name: string) {}
  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FakeDir> {
    let d = this.dirs.get(name);
    if (!d) {
      if (!opts?.create) throw new DOMException('not found', 'NotFoundError');
      d = new FakeDir(name);
      this.dirs.set(name, d);
    }
    return d;
  }
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    let f = this.files.get(name);
    if (!f) {
      if (!opts?.create) throw new DOMException('not found', 'NotFoundError');
      f = new FakeFile(new Uint8Array());
      this.files.set(name, f);
    }
    const file = f;
    return {
      kind: 'file' as const,
      async createWritable() {
        const chunks: Uint8Array[] = [];
        return {
          async write(data: Uint8Array) {
            chunks.push(data);
          },
          async close() {
            const total = chunks.reduce((n, c) => n + c.byteLength, 0);
            const out = new Uint8Array(total);
            let off = 0;
            for (const c of chunks) {
              out.set(c, off);
              off += c.byteLength;
            }
            file.data = out;
          },
        };
      },
      async getFile() {
        return { arrayBuffer: async () => file.data.slice().buffer };
      },
    };
  }
  async removeEntry(name: string, _opts?: { recursive?: boolean }) {
    if (this.files.delete(name)) return;
    if (this.dirs.delete(name)) return;
    throw new DOMException('not found', 'NotFoundError');
  }
  async *entries(): AsyncGenerator<[string, FakeDir | { kind: 'file' }]> {
    for (const [n] of this.files) yield [n, { kind: 'file' }];
    for (const [n, d] of this.dirs) yield [n, d];
  }
}

let fakeRoot: FakeDir;
function installFakeOpfs() {
  fakeRoot = new FakeDir('');
  Object.defineProperty(globalThis, 'navigator', {
    value: { storage: { getDirectory: async () => fakeRoot } },
    configurable: true,
  });
}

function b(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe('SessionStore (memory adapters)', () => {
  it('creates sessions, adds files and names the session after the first file', async () => {
    let now = 1_700_000_000_000;
    const store = createMemorySessionStore(() => now);
    let s = await store.create();
    expect(s.name).toMatch(/^Session \d{4}-\d{2}-\d{2}$/);
    const added = await store.addFile(s, { name: 'Akte-Mueller.pdf', mime: 'application/pdf', bytes: b('%PDF-1') });
    s = added.meta;
    expect(s.name.startsWith('Akte-Mueller ·')).toBe(true);
    expect(s.activeFileId).toBe(added.file.id);
    expect(s.files[0]?.family).toBe('pdf');
    expect(s.bytes).toBe(6);
    now += 1000;
    const second = await store.addFile(s, { name: 'foto.png', mime: 'image/png', bytes: b('png') });
    expect(second.meta.files).toHaveLength(2);
    expect(second.meta.activeFileId).toBe(added.file.id);
    expect(await store.readSource(added.file)).toEqual(b('%PDF-1'));
    const list = await store.list();
    expect(list[0]).toMatchObject({ fileCount: 2, stepCount: 0, fileNames: ['Akte-Mueller.pdf', 'foto.png'] });
  });

  it('writes revisions, reads head, trims snapshots beyond depth and removes files', async () => {
    const store = createMemorySessionStore();
    let s = await store.create();
    const { meta, file } = await store.addFile(s, { name: 'a.pdf', mime: 'application/pdf', bytes: b('orig') });
    s = meta;
    const revisions: StepRecord[] = [];
    for (let i = 0; i < 23; i++) {
      const rec = { ...newStepRecord('pdf-rotate', { angle: 90 }, {}), status: 'ok' as const, snapshot: true };
      rec.outputRef = await store.writeRevision(s.id, file.id, rec.stepId, b(`v${i}`));
      rec.outputSize = 2;
      revisions.push(rec);
    }
    let f = { ...file, revisions, head: 22 };
    expect(await store.readHead(f)).toEqual(b('v22'));
    f = await store.trimSnapshots(f, 20);
    expect(f.revisions.filter((r) => r.snapshot)).toHaveLength(20);
    expect(f.revisions[0]?.snapshot).toBe(false);
    expect(f.revisions[0]?.outputRef).toBeUndefined();
    expect(await store.readBlob(revKey(s.id, file.id, revisions[0]!.stepId))).toBeUndefined();
    expect(await store.readBlob(revKey(s.id, file.id, revisions[3]!.stepId))).toEqual(b('v3'));
    s = await store.save({ ...s, files: [f] });
    expect(s.bytes).toBe(4 + 20 * 2);
    s = await store.removeFile(s, file.id);
    expect(s.files).toEqual([]);
    expect(s.activeFileId).toBeNull();
    expect(await store.readBlob(srcKey(s.id, file.id))).toBeUndefined();
  });

  it('deletes whole sessions and reports usage', async () => {
    const store = createMemorySessionStore();
    const a = await store.addFile(await store.create(), { name: 'a.pdf', mime: 'application/pdf', bytes: b('aaaa') });
    await store.addFile(await store.create(), { name: 'b.pdf', mime: 'application/pdf', bytes: b('bb') });
    expect(await store.usage()).toEqual({ bytes: 6, sessions: 2 });
    await store.delete(a.meta.id);
    expect(await store.usage()).toEqual({ bytes: 2, sessions: 1 });
    expect(await store.readBlob(a.file.srcRef)).toBeUndefined();
  });

  it('defaultSessionName strips extension and appends the date', () => {
    expect(defaultSessionName('Vertrag.final.pdf', Date.UTC(2026, 8, 14, 12))).toMatch(/^Vertrag\.final · 2026-09-1[45]$/);
    expect(opfsPathOf('s1/src/f1')).toBe('sessions/s1/src/f1');
  });
});

describe('SessionStore (fake OPFS + fake IndexedDB)', () => {
  beforeEach(() => installFakeOpfs());
  afterEach(async () => {
    indexedDB.deleteDatabase('neotools-sessions');
  });

  it('survives a "reload": a fresh store instance sees the same session and bytes', async () => {
    const make = () =>
      new SessionStore({
        meta: idbSessionMetaStore(),
        blobs: opfsBlobStore('sessions'),
        removeTree: (id) => opfsRemoveTree('sessions', id),
      });
    const first = make();
    let s = await first.create('Akte Müller');
    const added = await first.addFile(s, { name: 'antrag.pdf', mime: 'application/pdf', bytes: b('%PDF-antrag') });
    s = added.meta;
    const rec = { ...newStepRecord('pdf-compress', {}, {}), status: 'ok' as const, snapshot: true, outputSize: 5 };
    rec.outputRef = await first.writeRevision(s.id, added.file.id, rec.stepId, b('small'));
    s = await first.save({ ...s, files: [{ ...added.file, revisions: [rec], head: 0 }] });

    // "reload"
    const second = make();
    const loaded = await second.get(s.id);
    expect(loaded?.name).toBe('Akte Müller');
    expect(loaded?.files[0]?.head).toBe(0);
    expect(await second.readHead(loaded!.files[0]!)).toEqual(b('small'));
    expect(await second.readSource(loaded!.files[0]!)).toEqual(b('%PDF-antrag'));
    expect(fakeRoot.dirs.get('sessions')?.dirs.get(s.id)?.dirs.get('src')?.files.size).toBe(1);
    expect(fakeRoot.dirs.get('sessions')?.dirs.get(s.id)?.dirs.get('rev')?.dirs.get(added.file.id)?.files.size).toBe(1);

    await second.delete(s.id);
    expect(await second.get(s.id)).toBeUndefined();
    expect(fakeRoot.dirs.get('sessions')?.dirs.has(s.id)).toBe(false);
  });
});
