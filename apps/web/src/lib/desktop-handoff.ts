export const HANDOFF_SESSION_KEY = 'neotools:handoff';
export const HANDOFF_RESULT_KEY = 'neotools:handoff-result';

export interface HandoffMeta {
  id: string;
  name: string;
  mime: string;
  returnTo?: 'reader';
  toolId?: string;
}

export interface HandoffFile extends HandoffMeta {
  bytes: Uint8Array;
}

const memory = new Map<string, Uint8Array>();
const metaMemory = new Map<string, HandoffMeta>();

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `h-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sessionGet(key: string): HandoffMeta | null {
  if (typeof sessionStorage === 'undefined') return metaMemory.get(key) ?? null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return metaMemory.get(key) ?? null;
    return JSON.parse(raw) as HandoffMeta;
  } catch {
    return metaMemory.get(key) ?? null;
  }
}

function sessionSet(key: string, meta: HandoffMeta): void {
  metaMemory.set(key, meta);
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(key, JSON.stringify(meta));
}

function sessionClear(key: string): void {
  metaMemory.delete(key);
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(key);
}

async function idbAvailable(): Promise<IDBFactory | null> {
  if (typeof indexedDB === 'undefined') return null;
  return indexedDB;
}

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('neotools-handoff', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

async function persistBytes(id: string, bytes: Uint8Array): Promise<void> {
  memory.set(id, bytes);
  const factory = await idbAvailable();
  if (!factory) return;
  try {
    const db = await idbOpen();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('idb write failed'));
      tx.objectStore('files').put(bytes, id);
    });
    db.close();
  } catch {
    // memory fallback is enough for same-tick tests
  }
}

async function loadBytes(id: string): Promise<Uint8Array | null> {
  const cached = memory.get(id);
  if (cached) return cached;
  const factory = await idbAvailable();
  if (!factory) return null;
  try {
    const db = await idbOpen();
    const bytes = await new Promise<Uint8Array | null>((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const req = tx.objectStore('files').get(id);
      req.onsuccess = () => {
        const value = req.result;
        resolve(value instanceof Uint8Array ? value : value ? new Uint8Array(value as ArrayBuffer) : null);
      };
      req.onerror = () => reject(req.error ?? new Error('idb read failed'));
    });
    db.close();
    if (bytes) memory.set(id, bytes);
    return bytes;
  } catch {
    return null;
  }
}

async function dropBytes(id: string): Promise<void> {
  memory.delete(id);
  const factory = await idbAvailable();
  if (!factory) return;
  try {
    const db = await idbOpen();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('idb delete failed'));
      tx.objectStore('files').delete(id);
    });
    db.close();
  } catch {
    // ignore
  }
}

async function put(key: string, file: { name: string; mime: string; bytes: Uint8Array }, extra?: Pick<HandoffMeta, 'returnTo' | 'toolId'>): Promise<HandoffMeta> {
  const meta: HandoffMeta = {
    id: randomId(),
    name: file.name,
    mime: file.mime,
    ...(extra?.returnTo ? { returnTo: extra.returnTo } : {}),
    ...(extra?.toolId ? { toolId: extra.toolId } : {}),
  };
  await persistBytes(meta.id, file.bytes);
  sessionSet(key, meta);
  return meta;
}

async function take(key: string): Promise<HandoffFile | null> {
  const meta = sessionGet(key);
  if (!meta) return null;
  const bytes = await loadBytes(meta.id);
  sessionClear(key);
  if (meta.id) await dropBytes(meta.id);
  if (!bytes) return null;
  return { ...meta, bytes };
}

export async function putHandoff(
  file: { name: string; mime: string; bytes: Uint8Array },
  extra?: Pick<HandoffMeta, 'returnTo' | 'toolId'>,
): Promise<HandoffMeta> {
  return put(HANDOFF_SESSION_KEY, file, extra);
}

export async function peekHandoff(): Promise<HandoffMeta | null> {
  return sessionGet(HANDOFF_SESSION_KEY);
}

export async function takeHandoff(): Promise<HandoffFile | null> {
  return take(HANDOFF_SESSION_KEY);
}

export async function putHandoffResult(
  file: { name: string; mime: string; bytes: Uint8Array },
  extra?: Pick<HandoffMeta, 'returnTo' | 'toolId'>,
): Promise<HandoffMeta> {
  return put(HANDOFF_RESULT_KEY, file, { returnTo: 'reader', ...extra });
}

export async function takeHandoffResult(): Promise<HandoffFile | null> {
  return take(HANDOFF_RESULT_KEY);
}

/** Test helper: wipe in-memory slots without touching the browser stores. */
export function resetHandoffMemory(): void {
  memory.clear();
  metaMemory.clear();
}
