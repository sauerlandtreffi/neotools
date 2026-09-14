import type { ModelEntry } from './schema.js';
import { assertSha256 } from './hash.js';

const CACHE_NAME = 'neotools-models-v1';

export interface LoadProgress {
  modelId: string;
  loaded: number;
  total: number;
  ratio: number;
}

export type ProgressFn = (ev: LoadProgress) => void;

async function cacheApi(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

export async function cacheGet(entry: ModelEntry): Promise<Uint8Array | null> {
  const cache = await cacheApi();
  if (!cache) return null;
  const res = await cache.match(`/assets/models/${entry.localName}`);
  if (!res || !res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

export async function cachePut(entry: ModelEntry, bytes: Uint8Array): Promise<void> {
  const cache = await cacheApi();
  if (!cache) return;
  const body = bytes.slice();
  await cache.put(
    `/assets/models/${entry.localName}`,
    new Response(body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(bytes.byteLength),
        'X-Model-Id': entry.id,
        'X-Model-Sha256': entry.sha256 ?? '',
      },
    }),
  );
}

export async function fetchSameOriginModel(
  entry: ModelEntry,
  url: string,
  onProgress?: ProgressFn,
): Promise<Uint8Array> {
  if (/^https?:\/\//i.test(url) && typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (!url.startsWith(origin) && !url.startsWith('/')) {
      throw new Error(`Remote-/CDN-URL zur Laufzeit verboten: ${url}`);
    }
  }
  if (/^https?:\/\//i.test(url) && typeof window === 'undefined') {
    throw new Error(`Remote-/CDN-URL zur Laufzeit verboten: ${url}`);
  }
  const path = url.startsWith('/') || url.startsWith(typeof location !== 'undefined' ? location.origin : '/')
    ? url
    : url;
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Modell nicht unter ${path} (${res.status}).`);
  const total = Number(res.headers.get('content-length') ?? entry.sizeBytes);
  if (!res.body || !res.body.getReader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onProgress?.({ modelId: entry.id, loaded: buf.byteLength, total, ratio: 1 });
    await assertSha256(buf, entry.sha256);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.({ modelId: entry.id, loaded, total, ratio: total ? loaded / total : 0 });
    }
  }
  const out = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  await assertSha256(out, entry.sha256);
  return out;
}
