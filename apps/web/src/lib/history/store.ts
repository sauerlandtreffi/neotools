import { newHistoryId, sha256Hex } from './hash';
import { idbBlobStore, idbMetaStore } from './idb';
import { memoryBlobStore, memoryMetaStore } from './memory';
import { opfsAvailable, opfsBlobStore } from './opfs';
import {
  DEFAULT_HISTORY_SETTINGS,
  type HistoryBlobRef,
  type HistoryBlobStore,
  type HistoryFile,
  type HistoryMetaStore,
  type HistoryRecord,
  type HistorySettings,
} from './types';

export interface HistoryStoreDeps {
  meta: HistoryMetaStore;
  blobs: HistoryBlobStore;
  now?: () => number;
}

function recordSize(record: HistoryRecord): number {
  return [...record.inputs, ...record.outputs].reduce((sum, file) => sum + (file.stored ? file.size : 0), 0);
}

export class HistoryStore {
  constructor(private readonly deps: HistoryStoreDeps) {}

  async settings(): Promise<HistorySettings> {
    return this.deps.meta.getSettings();
  }

  async updateSettings(patch: Partial<HistorySettings>): Promise<HistorySettings> {
    const current = await this.deps.meta.getSettings();
    const next = { ...current, ...patch };
    await this.deps.meta.setSettings(next);
    return next;
  }

  async list(): Promise<HistoryRecord[]> {
    await this.purgeExpired();
    return (await this.deps.meta.all()).sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<HistoryRecord | undefined> {
    return this.deps.meta.get(id);
  }

  async save(input: {
    toolId: string;
    options: unknown;
    inputs: HistoryFile[];
    outputs: HistoryFile[];
    report?: Record<string, unknown>;
    keepInputs?: boolean;
  }): Promise<HistoryRecord> {
    const settings = await this.deps.meta.getSettings();
    const now = (this.deps.now ?? Date.now)();
    const id = newHistoryId();
    const keepInputs = input.keepInputs ?? settings.keepInputs;
    const inputs: HistoryBlobRef[] = [];
    for (let i = 0; i < input.inputs.length; i++) {
      const file = input.inputs[i]!;
      const key = `${id}/in/${i}`;
      const sha256 = await sha256Hex(file.data);
      if (keepInputs) await this.deps.blobs.write(key, file.data);
      inputs.push({
        name: file.name,
        mime: file.mime,
        size: file.data.byteLength,
        sha256,
        stored: keepInputs,
        key,
      });
    }
    const outputs: HistoryBlobRef[] = [];
    for (let i = 0; i < input.outputs.length; i++) {
      const file = input.outputs[i]!;
      const key = `${id}/out/${i}`;
      const sha256 = await sha256Hex(file.data);
      await this.deps.blobs.write(key, file.data);
      outputs.push({
        name: file.name,
        mime: file.mime,
        size: file.data.byteLength,
        sha256,
        stored: true,
        key,
      });
    }
    const verification = input.report?.verification;
    const provenance = input.report?.provenance;
    const record: HistoryRecord = {
      id,
      toolId: input.toolId,
      options: input.options,
      createdAt: now,
      expiresAt: now + settings.ttlMs,
      keepInputs,
      inputs,
      outputs,
      report: input.report,
      verification,
      provenance,
    };
    await this.deps.meta.put(record);
    await this.enforceQuota();
    return record;
  }

  async readBlob(ref: HistoryBlobRef): Promise<Uint8Array | undefined> {
    if (!ref.stored) return undefined;
    return this.deps.blobs.read(ref.key);
  }

  async delete(id: string): Promise<void> {
    const record = await this.deps.meta.get(id);
    if (record) {
      for (const ref of [...record.inputs, ...record.outputs]) {
        await this.deps.blobs.delete(ref.key);
      }
    }
    await this.deps.meta.delete(id);
  }

  async clear(): Promise<void> {
    await this.deps.blobs.clear();
    await this.deps.meta.clear();
    if (typeof indexedDB !== 'undefined') {
      try {
        indexedDB.deleteDatabase('neotools-history');
        indexedDB.deleteDatabase('neotools-history-blobs');
      } catch {
        // ignore
      }
    }
  }

  async purgeExpired(now = (this.deps.now ?? Date.now)()): Promise<number> {
    const all = await this.deps.meta.all();
    let removed = 0;
    for (const record of all) {
      if (record.expiresAt <= now) {
        await this.delete(record.id);
        removed += 1;
      }
    }
    return removed;
  }

  async enforceQuota(): Promise<void> {
    const settings = await this.deps.meta.getSettings();
    let records = (await this.deps.meta.all()).sort((a, b) => a.createdAt - b.createdAt);
    let total = records.reduce((sum, record) => sum + recordSize(record), 0);
    while (total > settings.maxBytes && records.length) {
      const oldest = records.shift();
      if (!oldest) break;
      total -= recordSize(oldest);
      await this.delete(oldest.id);
    }
  }
}

export function createMemoryHistoryStore(settings?: HistorySettings): HistoryStore {
  return new HistoryStore({
    meta: memoryMetaStore(settings ?? DEFAULT_HISTORY_SETTINGS),
    blobs: memoryBlobStore(),
  });
}

export function createBrowserHistoryStore(): HistoryStore {
  return new HistoryStore({
    meta: idbMetaStore(),
    blobs: opfsAvailable() ? opfsBlobStore() : idbBlobStore(),
  });
}

let browserStore: HistoryStore | undefined;

export function getBrowserHistoryStore(): HistoryStore {
  if (!browserStore) browserStore = createBrowserHistoryStore();
  return browserStore;
}
