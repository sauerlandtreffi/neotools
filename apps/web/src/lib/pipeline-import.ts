const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Hard limits for untrusted pipeline specs (URL hash, pasted JSON, imported files). */
export const PIPELINE_IMPORT_LIMITS = {
  maxDepth: 6,
  maxSteps: 32,
  maxKeys: 256,
  maxArrayItems: 256,
  maxStringLength: 4096,
  maxEncodedLength: 64 * 1024,
} as const;

interface Budget {
  keys: number;
}

function sanitizeValue(value: unknown, depth: number, budget: Budget): unknown {
  if (value === null) return null;
  const t = typeof value;
  if (t === 'string') return (value as string).slice(0, PIPELINE_IMPORT_LIMITS.maxStringLength);
  if (t === 'number') return Number.isFinite(value as number) ? value : undefined;
  if (t === 'boolean') return value;
  if (t !== 'object') return undefined; // functions, symbols, bigint …
  if (depth >= PIPELINE_IMPORT_LIMITS.maxDepth) return undefined;
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value.slice(0, PIPELINE_IMPORT_LIMITS.maxArrayItems)) {
      const next = sanitizeValue(item, depth + 1, budget);
      if (next !== undefined) out.push(next);
    }
    return out;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return undefined; // Map, Date, class instances …
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    if (budget.keys <= 0) break;
    budget.keys -= 1;
    const next = sanitizeValue((value as Record<string, unknown>)[key], depth + 1, budget);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

/**
 * Plain-JSON only: drops `__proto__`/`constructor`/`prototype` at every level
 * (objects *and* arrays), non-JSON values, exotic prototypes, and enforces
 * depth/key/string budgets.
 */
export function sanitizePipelineOptions(raw: unknown, budget: Budget = { keys: PIPELINE_IMPORT_LIMITS.maxKeys }): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = sanitizeValue(raw, 0, budget);
  return out && typeof out === 'object' && !Array.isArray(out) ? (out as Record<string, unknown>) : {};
}

export interface ImportedStep {
  toolId: string;
  options: Record<string, unknown>;
  whenMime?: string[];
}

const MIME_RE = /^[a-z0-9!#$&^_.+-]{1,64}\/[a-z0-9!#$&^_.+*-]{1,96}$/i;

export function sanitizePipelineSteps(raw: unknown, knownIds: ReadonlySet<string>): ImportedStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: ImportedStep[] = [];
  const budget: Budget = { keys: PIPELINE_IMPORT_LIMITS.maxKeys };
  for (const step of raw.slice(0, PIPELINE_IMPORT_LIMITS.maxSteps)) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) continue;
    const rec = step as Record<string, unknown>;
    const toolId = rec.toolId;
    if (typeof toolId !== 'string' || DANGEROUS_KEYS.has(toolId) || !knownIds.has(toolId)) continue;
    const options = sanitizePipelineOptions(rec.options, budget);
    const next: ImportedStep = { toolId, options };
    if (Array.isArray(rec.whenMime)) {
      const mimes = rec.whenMime.filter((m): m is string => typeof m === 'string' && (m === '*/*' || MIME_RE.test(m))).slice(0, 32);
      if (mimes.length) next.whenMime = mimes;
    }
    steps.push(next);
  }
  return steps;
}

/** Decode a `#p=` hash payload with a size cap; returns `undefined` on any problem. */
export function decodePipelineHash(raw: string): unknown {
  if (!raw || raw.length > PIPELINE_IMPORT_LIMITS.maxEncodedLength) return undefined;
  if (!/^[A-Za-z0-9_-]+=*$/.test(raw)) return undefined;
  try {
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const json = atob(padded + pad);
    if (json.length > PIPELINE_IMPORT_LIMITS.maxEncodedLength) return undefined;
    return JSON.parse(json) as unknown;
  } catch {
    return undefined;
  }
}
