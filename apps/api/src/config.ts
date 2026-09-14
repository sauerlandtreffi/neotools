import { readFileSync } from 'node:fs';

export interface ApiConfig {
  host: string;
  port: number;
  apiKeys: Set<string>;
  maxUploadBytes: number;
  maxParallel: number;
  jobTimeoutMs: number;
  rateMax: number;
  rateWindow: string;
  licenseToken?: string;
  licensePubkey?: string;
  presets?: unknown;
  inlineWorkers: boolean;
  auditPath?: string;
  requireApiFeature: boolean;
}

function parseKeys(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  const value = raw.trim();
  if (value.startsWith('@') || value.startsWith('/') || value.endsWith('.txt') || value.endsWith('.keys')) {
    try {
      const text = readFileSync(value.startsWith('@') ? value.slice(1) : value, 'utf8');
      return new Set(
        text
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } catch {
      return new Set();
    }
  }
  return new Set(
    value
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function loadJsonEnv(name: string): unknown {
  const raw = process.env[name];
  if (!raw) return undefined;
  try {
    if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
    return JSON.parse(readFileSync(raw, 'utf8'));
  } catch {
    return undefined;
  }
}

export function loadApiConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    host: process.env.NEOTOOLS_API_HOST ?? '0.0.0.0',
    port: Number(process.env.NEOTOOLS_API_PORT ?? 3000),
    apiKeys: parseKeys(process.env.NEOTOOLS_API_KEYS),
    maxUploadBytes: Number(process.env.NEOTOOLS_MAX_UPLOAD_BYTES ?? 50 * 1024 * 1024),
    maxParallel: Number(process.env.NEOTOOLS_MAX_PARALLEL ?? 2),
    jobTimeoutMs: Number(process.env.NEOTOOLS_JOB_TIMEOUT_MS ?? 120_000),
    rateMax: Number(process.env.NEOTOOLS_RATE_MAX ?? 60),
    rateWindow: process.env.NEOTOOLS_RATE_WINDOW ?? '1 minute',
    licenseToken: process.env.NEOTOOLS_LICENSE,
    licensePubkey: process.env.NEOTOOLS_LICENSE_PUBKEY,
    presets: loadJsonEnv('NEOTOOLS_PRESETS'),
    inlineWorkers: process.env.NEOTOOLS_API_INLINE === '1',
    auditPath: process.env.NEOTOOLS_AUDIT_LOG,
    requireApiFeature: process.env.NEOTOOLS_API_ALLOW_COMMUNITY !== '1',
    ...overrides,
  };
}
