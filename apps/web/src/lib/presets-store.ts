const DB = 'neotools-presets';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveTeamPresetsJson(text: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(text, 'json');
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadTeamPresetsJson(): Promise<string> {
  try {
    const db = await openDb();
    const value = await new Promise<string>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get('json');
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : '');
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  } catch {
    return '';
  }
}
