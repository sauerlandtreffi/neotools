import type { Platform, ToolContext } from '@neotools/engine';
import { throwIfAborted } from '@neotools/engine';
import { canUseMultiThreadCore } from './capabilities.js';
import { createProgressSink } from './progress.js';
import type { FfmpegRunRequest, FfmpegRunResult } from './types.js';

type FfmpegInstance = {
  loaded: boolean;
  load: (opts: { coreURL: string; wasmURL: string; workerURL?: string }) => Promise<void>;
  writeFile: (name: string, data: Uint8Array) => Promise<void>;
  readFile: (name: string) => Promise<Uint8Array | string>;
  exec: (args: string[]) => Promise<number>;
  terminate: () => Promise<void> | void;
  on: (ev: 'log' | 'progress', fn: (data: { message?: string; progress?: number; time?: number }) => void) => void;
};

const CACHE = 'neotools-ffmpeg-v1';
let instance: FfmpegInstance | null = null;
let loading: Promise<FfmpegInstance> | null = null;

function ffmpegBase(platform?: Platform): string {
  const raw = platform?.assets?.ffmpegBase ?? '/assets/ffmpeg';
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

async function fetchWithProgress(url: string, ctx?: ToolContext, label = 'FFmpeg-Core'): Promise<Uint8Array> {
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(url);
      if (hit) return new Uint8Array(await hit.arrayBuffer());
      const bytes = await download(url, ctx, label);
      await cache.put(url, new Response(bytes.slice().buffer));
      return bytes;
    } catch {
      // fall through
    }
  }
  if (typeof process !== 'undefined' && process.versions?.node && url.startsWith('file:')) {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    return new Uint8Array(await readFile(fileURLToPath(url)));
  }
  return download(url, ctx, label);
}

async function download(url: string, ctx?: ToolContext, label = 'FFmpeg-Core'): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} nicht geladen (${res.status}): ${url}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      ctx?.progress(Math.min(0.2, (received / total) * 0.2), `${label} ${Math.round((received / total) * 100)}%`);
    }
  }
  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

async function toBlobUrl(bytes: Uint8Array, mime: string): Promise<string> {
  if (typeof URL !== 'undefined' && typeof Blob !== 'undefined') {
    return URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mime }));
  }
  const { toBlobURL } = await import('@ffmpeg/util');
  const b64 = Buffer.from(bytes).toString('base64');
  const dataUrl = `data:${mime};base64,${b64}`;
  return toBlobURL(dataUrl, mime);
}

async function resolveNodeCore(mt: boolean): Promise<{ coreURL: string; wasmURL: string; workerURL?: string } | null> {
  if (typeof process === 'undefined' || !process.versions?.node) return null;
  try {
    const { createRequire } = await import('node:module');
    const { pathToFileURL } = await import('node:url');
    const req = createRequire(import.meta.url);
    const spec = mt ? '@ffmpeg/core-mt' : '@ffmpeg/core';
    const core = req.resolve(spec);
    const wasm = core.replace(/ffmpeg-core\.js$/, 'ffmpeg-core.wasm');
    const out: { coreURL: string; wasmURL: string; workerURL?: string } = {
      coreURL: pathToFileURL(core).href,
      wasmURL: pathToFileURL(wasm).href,
    };
    if (mt) {
      out.workerURL = pathToFileURL(core.replace(/ffmpeg-core\.js$/, 'ffmpeg-core.worker.js')).href;
    }
    return out;
  } catch {
    return null;
  }
}

export async function loadWasmFfmpeg(ctx?: ToolContext, platform?: Platform): Promise<FfmpegInstance> {
  if (instance?.loaded) return instance;
  if (loading) return loading;
  loading = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const ffmpeg = new FFmpeg() as unknown as FfmpegInstance;
    const mt = canUseMultiThreadCore();
    const base = ffmpegBase(platform);
    let urls = await resolveNodeCore(mt);
    if (!urls) {
      const coreName = mt ? 'ffmpeg-core-mt.js' : 'ffmpeg-core.js';
      const wasmName = mt ? 'ffmpeg-core-mt.wasm' : 'ffmpeg-core.wasm';
      const coreBytes = await fetchWithProgress(`${base}/${coreName}`, ctx, 'ffmpeg-core.js');
      const wasmBytes = await fetchWithProgress(`${base}/${wasmName}`, ctx, 'ffmpeg-core.wasm');
      urls = {
        coreURL: await toBlobUrl(coreBytes, 'text/javascript'),
        wasmURL: await toBlobUrl(wasmBytes, 'application/wasm'),
      };
      if (mt) {
        try {
          const workerBytes = await fetchWithProgress(`${base}/ffmpeg-core.worker.js`, ctx, 'ffmpeg-core.worker.js');
          urls.workerURL = await toBlobUrl(workerBytes, 'text/javascript');
        } catch {
          // ST fallback already chosen if worker missing
        }
      }
    }
    await ffmpeg.load(urls);
    instance = ffmpeg;
    return ffmpeg;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

export async function terminateWasm(): Promise<void> {
  if (!instance) return;
  try {
    await instance.terminate();
  } catch {
    // ignore
  }
  instance = null;
}

export async function runWasmFfmpeg(ctx: ToolContext | undefined, req: FfmpegRunRequest): Promise<FfmpegRunResult> {
  const ffmpeg = await loadWasmFfmpeg(ctx, ctx?.platform);
  const logs: string[] = [];
  const onProgress = createProgressSink(ctx, req.durationHint);
  const logFn = (ev: { message?: string }) => {
    if (ev.message) {
      logs.push(ev.message);
      onProgress(ev.message);
    }
  };
  const progFn = (ev: { progress?: number }) => {
    if (typeof ev.progress === 'number') ctx?.progress(Math.min(0.99, ev.progress), 'ffmpeg.wasm');
  };
  ffmpeg.on('log', logFn);
  ffmpeg.on('progress', progFn);
  const abort = () => {
    void terminateWasm();
  };
  ctx?.signal.addEventListener('abort', abort, { once: true });
  try {
    for (const input of req.inputs) {
      await ffmpeg.writeFile(input.name, input.data);
    }
    if (req.cwdExtra) {
      for (const [name, data] of Object.entries(req.cwdExtra)) {
        await ffmpeg.writeFile(name, data);
      }
    }
    throwIfAborted(ctx?.signal ?? new AbortController().signal);
    const code = await ffmpeg.exec(['-y', '-hide_banner', ...req.args]);
    if (code !== 0 && req.outputs.length) {
      throw new Error(`FFmpeg-WASM Code ${code}.\n${logs.join('\n').slice(-4000)}`);
    }
    const files: Record<string, Uint8Array> = {};
    for (const name of req.outputs) {
      try {
        const data = await ffmpeg.readFile(name);
        files[name] = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      } catch {
        // missing
      }
    }
    return { files, log: logs.join('\n'), backend: 'wasm' };
  } finally {
    ctx?.signal.removeEventListener('abort', abort);
  }
}
