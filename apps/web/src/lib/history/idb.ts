import { DEFAULT_HISTORY_SETTINGS, type HistoryMetaStore, type HistoryRecord, type HistorySettings } from './types';

const DB_NAME = 'neotools-history';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('runs')) db.createObjectStore('runs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function idbMetaStore(): HistoryMetaStore {
  return {
    async put(record) {
      const db = await openDb();
      const tx = db.transaction('runs', 'readwrite');
      tx.objectStore('runs').put(record);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    async get(id) {
      const db = await openDb();
      const row = await reqToPromise(db.transaction('runs').objectStore('runs').get(id));
      db.close();
      return row as HistoryRecord | undefined;
    },
    async all() {
      const db = await openDb();
      const rows = await reqToPromise(db.transaction('runs').objectStore('runs').getAll());
      db.close();
      return (rows as HistoryRecord[]).sort((a, b) => b.createdAt - a.createdAt);
    },
    async delete(id) {
      const db = await openDb();
      const tx = db.transaction('runs', 'readwrite');
      tx.objectStore('runs').delete(id);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    async clear() {
      const db = await openDb();
      const tx = db.transaction(['runs', 'settings'], 'readwrite');
      tx.objectStore('runs').clear();
      tx.objectStore('settings').clear();
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    async getSettings() {
      const db = await openDb();
      const row = await reqToPromise(db.transaction('settings').objectStore('settings').get('default'));
      db.close();
      return { ...DEFAULT_HISTORY_SETTINGS, ...(row as Partial<HistorySettings> | undefined) };
    },
    async setSettings(settings) {
      const db = await openDb();
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put(settings, 'default');
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
  };
}

export function idbBlobStore(dbName = `${DB_NAME}-blobs`): import('./types').HistoryBlobStore {
  const storeName = 'blobs';
  const open = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  return {
    async write(key, data) {
      const db = await open();
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(data.slice().buffer, key);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    async read(key) {
      const db = await open();
      const buf = await reqToPromise(db.transaction(storeName).objectStore(storeName).get(key));
      db.close();
      if (!buf) return undefined;
      return new Uint8Array(buf as ArrayBuffer);
    },
    async delete(key) {
      const db = await open();
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    async list(prefix = '') {
      const db = await open();
      const keys = await reqToPromise(db.transaction(storeName).objectStore(storeName).getAllKeys());
      db.close();
      return (keys as string[]).filter((key) => key.startsWith(prefix));
    },
    async clear() {
      const db = await open();
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
  };
}
