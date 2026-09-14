import { neoFileFromBytes } from './neo-file.js';
import { runTool } from './run-tool.js';
import type { NeoFile, ToolContext, ToolDefinition, ToolResult } from './types.js';

/**
 * Document handle (FRONTEND-REDESIGN §2.15 C): one logical document across
 * many steps. `parsed` is pack-private and cached per (id, generation) so a
 * follow-up step may reuse e.g. a pdf-lib `PDFDocument` without re-parsing.
 */
export interface DocumentHandle {
  id: string;
  name: string;
  mime: string;
  size: number;
  source: { kind: 'opfs'; path: string } | { kind: 'bytes'; bytes: Uint8Array };
  /** Pack-private parsed representation, never structured across the UI boundary. */
  parsed?: unknown;
  /** Incremented on every mutation; a cached `parsed` is only valid for the same generation. */
  generation: number;
}

export interface OpfsReader {
  read(path: string): Promise<Uint8Array | undefined>;
}

let seq = 0;
export function newHandleId(prefix = 'doc'): string {
  seq += 1;
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10);
  return `${prefix}-${rnd}-${seq}`;
}

export function handleFromBytes(name: string, bytes: Uint8Array, mime: string, id = newHandleId()): DocumentHandle {
  return { id, name, mime, size: bytes.byteLength, source: { kind: 'bytes', bytes }, generation: 0 };
}

export function handleFromOpfs(name: string, path: string, mime: string, size: number, id = newHandleId()): DocumentHandle {
  return { id, name, mime, size, source: { kind: 'opfs', path }, generation: 0 };
}

export async function handleBytes(handle: DocumentHandle, opfs?: OpfsReader): Promise<Uint8Array> {
  if (handle.source.kind === 'bytes') return handle.source.bytes;
  if (!opfs) throw new Error(`Kein OPFS-Reader für ${handle.source.path}`);
  const bytes = await opfs.read(handle.source.path);
  if (!bytes) throw new Error(`OPFS-Datei fehlt: ${handle.source.path}`);
  return bytes;
}

export async function handleToNeoFile(handle: DocumentHandle, opfs?: OpfsReader): Promise<NeoFile> {
  const bytes = await handleBytes(handle, opfs);
  return neoFileFromBytes(handle.name, bytes, handle.mime);
}

/** Next generation of the same logical document. */
export function advanceHandle(handle: DocumentHandle, next: { name?: string; mime?: string; bytes: Uint8Array }): DocumentHandle {
  return {
    id: handle.id,
    name: next.name ?? handle.name,
    mime: next.mime ?? handle.mime,
    size: next.bytes.byteLength,
    source: { kind: 'bytes', bytes: next.bytes },
    generation: handle.generation + 1,
  };
}

/**
 * Small LRU keyed by `${id}@${generation}`. Parsers are async and deduplicated
 * so two concurrent callers share one parse.
 */
export class ParseCache {
  private readonly entries = new Map<string, Promise<unknown>>();
  private hits = 0;
  private misses = 0;

  constructor(private readonly maxEntries = 8) {}

  private key(handle: DocumentHandle): string {
    return `${handle.id}@${handle.generation}`;
  }

  has(handle: DocumentHandle): boolean {
    return this.entries.has(this.key(handle));
  }

  async get<T>(handle: DocumentHandle, parse: (bytes: Uint8Array) => Promise<T>, opfs?: OpfsReader): Promise<T> {
    const key = this.key(handle);
    const cached = this.entries.get(key);
    if (cached) {
      this.hits += 1;
      // refresh LRU position
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached as Promise<T>;
    }
    this.misses += 1;
    const pending = (async () => parse(await handleBytes(handle, opfs)))();
    this.entries.set(key, pending);
    pending.catch(() => this.entries.delete(key));
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return pending;
  }

  /** Drop every generation of a document (e.g. file removed from the tray). */
  invalidate(id: string): void {
    for (const key of [...this.entries.keys()]) if (key.startsWith(`${id}@`)) this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  stats(): { hits: number; misses: number; size: number } {
    return { hits: this.hits, misses: this.misses, size: this.entries.size };
  }
}

export interface MutateResult {
  handle: DocumentHandle;
  result: ToolResult;
  /** Non-primary outputs (reports, sidecars). */
  sidecars: NeoFile[];
}

/**
 * Run `tool` on a handle and return the next generation. The primary output is
 * the first output whose MIME matches the input family (PDF→PDF etc.), else the
 * first output. `verify` still sees freshly reloaded bytes via `runTool`.
 */
export async function mutateHandle(
  ctx: ToolContext,
  handle: DocumentHandle,
  tool: ToolDefinition,
  options: unknown,
  opfs?: OpfsReader,
): Promise<MutateResult> {
  const file = await handleToNeoFile(handle, opfs);
  const scoped: ToolContext = { ...ctx, document: handle };
  const result = await runTool(tool, scoped, [file], options);
  const primary = pickPrimaryOutput(result.outputs, handle.mime);
  if (!primary) {
    return { handle, result, sidecars: result.outputs };
  }
  const bytes = await primary.bytes();
  const next = advanceHandle(handle, { name: primary.name, mime: primary.mime, bytes });
  return { handle: next, result, sidecars: result.outputs.filter((o) => o !== primary) };
}

export function pickPrimaryOutput(outputs: readonly NeoFile[], inputMime: string): NeoFile | undefined {
  if (!outputs.length) return undefined;
  const same = outputs.find((o) => o.mime === inputMime);
  if (same) return same;
  const nonSidecar = outputs.find((o) => o.mime !== 'application/json' && o.mime !== 'text/plain');
  return nonSidecar ?? outputs[0];
}
