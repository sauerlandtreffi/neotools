import { verifyLicense, type LicenseVerifyResult } from '@neotools/license';

const DB = 'neotools-license';
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

export async function saveLicenseToken(token: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(token, 'token');
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadLicenseToken(): Promise<string> {
  const db = await openDb();
  const value = await new Promise<string>((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get('token');
    req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : '');
    req.onerror = () => reject(req.error);
  });
  db.close();
  return value;
}

export async function clearLicenseToken(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete('token');
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function verifyStoredLicense(pubkey: string, embedded?: string): Promise<LicenseVerifyResult> {
  const token = (await loadLicenseToken()) || embedded || '';
  return verifyLicense(token, pubkey);
}
