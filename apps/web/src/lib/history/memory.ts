import {
  DEFAULT_HISTORY_SETTINGS,
  type HistoryBlobStore,
  type HistoryMetaStore,
  type HistoryRecord,
  type HistorySettings,
} from './types';

export function memoryBlobStore(): HistoryBlobStore {
  const map = new Map<string, Uint8Array>();
  return {
    async write(key, data) {
      map.set(key, data.slice());
    },
    async read(key) {
      const found = map.get(key);
      return found ? found.slice() : undefined;
    },
    async delete(key) {
      map.delete(key);
    },
    async list(prefix = '') {
      return [...map.keys()].filter((key) => key.startsWith(prefix));
    },
    async clear() {
      map.clear();
    },
  };
}

export function memoryMetaStore(initial: HistorySettings = DEFAULT_HISTORY_SETTINGS): HistoryMetaStore {
  const runs = new Map<string, HistoryRecord>();
  let settings = { ...initial };
  return {
    async put(record) {
      runs.set(record.id, structuredClone(record));
    },
    async get(id) {
      const found = runs.get(id);
      return found ? structuredClone(found) : undefined;
    },
    async all() {
      return [...runs.values()].map((row) => structuredClone(row));
    },
    async delete(id) {
      runs.delete(id);
    },
    async clear() {
      runs.clear();
    },
    async getSettings() {
      return { ...settings };
    },
    async setSettings(next) {
      settings = { ...next };
    },
  };
}
