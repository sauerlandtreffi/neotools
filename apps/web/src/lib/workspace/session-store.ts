import { familyForMime } from '@neotools/engine';
import { idbBlobStore, opfsAvailable, opfsBlobStore } from '../history';
import { currentRef, snapshotsToTrim } from './step-stack';
import type {
  BlobStore,
  SessionFileMeta,
  SessionMeta,
  SessionMetaStore,
  SessionSummary,
  StepRecord,
} from './types';

const DB_NAME = 'neotools-sessions';
const OPFS_ROOT = 'sessions';

export interface SessionStoreDeps {
  meta: SessionMetaStore;
  blobs: BlobStore;
  now?: () => number;
  removeTree?: (sessionId: string) => Promise<void>;
}

function rid(prefix: string): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}${rnd}`;
}

export function defaultSessionName(firstFile: string | undefined, now: number): string {
  const d = new Date(now);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (!firstFile) return `Session ${date}`;
  const stem = firstFile.replace(/\.[^.]+$/, '').slice(0, 40);
  return `${stem} · ${date}`;
}

export function srcKey(sessionId: string, fileId: string): string {
  return `${sessionId}/src/${fileId}`;
}

export function revKey(sessionId: string, fileId: string, stepId: string): string {
  return `${sessionId}/rev/${fileId}/${stepId}`;
}

export function sidecarKey(sessionId: string, fileId: string, stepId: string, index: number): string {
  return `${sessionId}/side/${fileId}/${stepId}-${index}`;
}

/** Absolute OPFS path (for worker-side reads) of a blob key. */
export function opfsPathOf(key: string): string {
  return `${OPFS_ROOT}/${key}`;
}

/**
 * Session store: metadata in IndexedDB, bytes in OPFS (fallback IndexedDB) —
 * one quota world with the history store (FRONTEND-REDESIGN §2.6 / §6.4).
 */
export class SessionStore {
  constructor(private readonly deps: SessionStoreDeps) {}

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  async list(): Promise<SessionSummary[]> {
    const all = await this.deps.meta.all();
    return all
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((s) => ({
        id: s.id,
        name: s.name,
        updatedAt: s.updatedAt,
        fileCount: s.files.length,
        stepCount: s.files.reduce((n, f) => n + f.revisions.filter((r) => r.status === 'ok').length, 0),
        bytes: s.bytes,
        fileNames: s.files.map((f) => f.name),
      }));
  }

  async get(id: string): Promise<SessionMeta | undefined> {
    return this.deps.meta.get(id);
  }

  async create(name?: string): Promise<SessionMeta> {
    const now = this.now();
    const meta: SessionMeta = {
      id: rid('s'),
      name: name ?? defaultSessionName(undefined, now),
      createdAt: now,
      updatedAt: now,
      files: [],
      activeFileId: null,
      bytes: 0,
    };
    await this.deps.meta.put(meta);
    return meta;
  }

  async save(meta: SessionMeta): Promise<SessionMeta> {
    const next = { ...meta, updatedAt: this.now(), bytes: sessionBytes(meta) };
    await this.deps.meta.put(next);
    return next;
  }

  async rename(id: string, name: string): Promise<SessionMeta | undefined> {
    const meta = await this.get(id);
    if (!meta) return undefined;
    return this.save({ ...meta, name: name.trim().slice(0, 80) || meta.name });
  }

  /** Persist original bytes and append the file to the session. */
  async addFile(
    meta: SessionMeta,
    file: { name: string; mime: string; bytes: Uint8Array },
  ): Promise<{ meta: SessionMeta; file: SessionFileMeta }> {
    const id = rid('f');
    const key = srcKey(meta.id, id);
    await this.deps.blobs.write(key, file.bytes);
    const now = this.now();
    const entry: SessionFileMeta = {
      id,
      name: file.name,
      mime: file.mime,
      size: file.bytes.byteLength,
      family: familyForMime(file.mime),
      addedAt: now,
      srcRef: key,
      revisions: [],
      head: -1,
      findings: [],
    };
    const isFirst = meta.files.length === 0;
    const next: SessionMeta = {
      ...meta,
      name: isFirst && /^Session \d{4}-\d{2}-\d{2}$/.test(meta.name) ? defaultSessionName(file.name, now) : meta.name,
      files: [...meta.files, entry],
      activeFileId: meta.activeFileId ?? id,
    };
    return { meta: await this.save(next), file: entry };
  }

  async removeFile(meta: SessionMeta, fileId: string): Promise<SessionMeta> {
    const file = meta.files.find((f) => f.id === fileId);
    if (file) {
      await this.deps.blobs.delete(file.srcRef);
      for (const rev of file.revisions) {
        if (rev.outputRef) await this.deps.blobs.delete(rev.outputRef);
        for (const side of rev.sidecars ?? []) await this.deps.blobs.delete(side.ref);
      }
    }
    const files = meta.files.filter((f) => f.id !== fileId);
    const activeFileId = meta.activeFileId === fileId ? files[0]?.id ?? null : meta.activeFileId;
    return this.save({ ...meta, files, activeFileId });
  }

  async readBlob(key: string): Promise<Uint8Array | undefined> {
    return this.deps.blobs.read(key);
  }

  async readSource(file: SessionFileMeta): Promise<Uint8Array | undefined> {
    return this.deps.blobs.read(file.srcRef);
  }

  /** Bytes of the current head (original or snapshot). */
  async readHead(file: SessionFileMeta): Promise<Uint8Array | undefined> {
    return this.deps.blobs.read(currentRef(file));
  }

  async writeRevision(sessionId: string, fileId: string, stepId: string, bytes: Uint8Array): Promise<string> {
    const key = revKey(sessionId, fileId, stepId);
    await this.deps.blobs.write(key, bytes);
    return key;
  }

  async writeSidecar(sessionId: string, fileId: string, stepId: string, index: number, bytes: Uint8Array): Promise<string> {
    const key = sidecarKey(sessionId, fileId, stepId, index);
    await this.deps.blobs.write(key, bytes);
    return key;
  }

  async deleteRevisionBlobs(records: readonly StepRecord[]): Promise<void> {
    for (const rev of records) {
      if (rev.outputRef) await this.deps.blobs.delete(rev.outputRef);
      for (const side of rev.sidecars ?? []) await this.deps.blobs.delete(side.ref);
    }
  }

  /**
   * Enforce the snapshot depth on one file: drop OPFS snapshots of steps older
   * than the last N successful ones and mark them `snapshot: false`.
   */
  async trimSnapshots(file: SessionFileMeta, depth?: number): Promise<SessionFileMeta> {
    const trim = snapshotsToTrim(file.revisions, depth);
    if (!trim.length) return file;
    const ids = new Set(trim.map((r) => r.stepId));
    for (const rev of trim) if (rev.outputRef) await this.deps.blobs.delete(rev.outputRef);
    return {
      ...file,
      revisions: file.revisions.map((r) =>
        ids.has(r.stepId) ? { ...r, snapshot: false, outputRef: undefined } : r,
      ),
    };
  }

  async delete(id: string): Promise<void> {
    const meta = await this.deps.meta.get(id);
    if (meta) {
      if (this.deps.removeTree) {
        await this.deps.removeTree(id);
      } else {
        for (const key of await this.deps.blobs.list(`${id}/`)) await this.deps.blobs.delete(key);
      }
    }
    await this.deps.meta.delete(id);
  }

  async clearAll(): Promise<void> {
    await this.deps.blobs.clear();
    await this.deps.meta.clear();
  }

  async usage(): Promise<{ bytes: number; sessions: number }> {
    const all = await this.deps.meta.all();
    return { bytes: all.reduce((n, s) => n + s.bytes, 0), sessions: all.length };
  }
}

export function sessionBytes(meta: SessionMeta): number {
  let total = 0;
  for (const f of meta.files) {
    total += f.size;
    for (const r of f.revisions) {
      if (r.snapshot && r.outputRef) total += r.outputSize ?? 0;
      for (const s of r.sidecars ?? []) total += s.size;
    }
  }
  return total;
}

/* ------------------------------------------------------------------ */
/* Adapters                                                             */
/* ------------------------------------------------------------------ */

export function memorySessionMetaStore(): SessionMetaStore {
  const map = new Map<string, SessionMeta>();
  return {
    async put(meta) {
      map.set(meta.id, structuredClone(meta));
    },
    async get(id) {
      const m = map.get(id);
      return m ? structuredClone(m) : undefined;
    },
    async all() {
      return [...map.values()].map((m) => structuredClone(m));
    },
    async delete(id) {
      map.delete(id);
    },
    async clear() {
      map.clear();
    },
  };
}

export function memoryBlobStore(): BlobStore {
  const map = new Map<string, Uint8Array>();
  return {
    async write(key, data) {
      map.set(key, data.slice());
    },
    async read(key) {
      return map.get(key)?.slice();
    },
    async delete(key) {
      map.delete(key);
    },
    async list(prefix = '') {
      return [...map.keys()].filter((k) => k.startsWith(prefix));
    },
    async clear() {
      map.clear();
    },
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('sessions')) {
        req.result.createObjectStore('sessions', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function idbSessionMetaStore(): SessionMetaStore {
  return {
    async put(meta) {
      const db = await openDb();
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put(meta);
      await done(tx);
      db.close();
    },
    async get(id) {
      const db = await openDb();
      const row = await req(db.transaction('sessions').objectStore('sessions').get(id));
      db.close();
      return row as SessionMeta | undefined;
    },
    async all() {
      const db = await openDb();
      const rows = await req(db.transaction('sessions').objectStore('sessions').getAll());
      db.close();
      return rows as SessionMeta[];
    },
    async delete(id) {
      const db = await openDb();
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').delete(id);
      await done(tx);
      db.close();
    },
    async clear() {
      const db = await openDb();
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').clear();
      await done(tx);
      db.close();
    },
  };
}

export function createMemorySessionStore(now?: () => number): SessionStore {
  return new SessionStore({ meta: memorySessionMetaStore(), blobs: memoryBlobStore(), now });
}

export function createBrowserSessionStore(): SessionStore {
  const useOpfs = opfsAvailable();
  return new SessionStore({
    meta: idbSessionMetaStore(),
    blobs: useOpfs ? opfsBlobStore(OPFS_ROOT) : idbBlobStore(`${DB_NAME}-blobs`),
    removeTree: useOpfs
      ? async (sessionId) => {
          const { opfsRemoveTree } = await import('../history/opfs');
          await opfsRemoveTree(OPFS_ROOT, sessionId);
        }
      : undefined,
  });
}

let browserStore: SessionStore | undefined;
export function getSessionStore(): SessionStore {
  if (!browserStore) browserStore = createBrowserSessionStore();
  return browserStore;
}

/** Test hook. */
export function setSessionStoreForTests(store: SessionStore | undefined): void {
  browserStore = store;
}

export function opfsInUse(): boolean {
  return opfsAvailable();
}
