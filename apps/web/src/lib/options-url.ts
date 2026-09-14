import { decodeJsonBase64Url, encodeJsonBase64Url } from '@neotools/engine';

export function encodeOptionsParam(options: Record<string, unknown>): string {
  return encodeJsonBase64Url(options);
}

export function decodeOptionsParam(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = decodeJsonBase64Url(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function readToolQuery(search = typeof location !== 'undefined' ? location.search : ''): {
  preset?: string;
  options?: Record<string, unknown>;
  rerun?: string;
} {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const preset = params.get('preset') ?? undefined;
  const raw = params.get('o');
  const options = raw ? decodeOptionsParam(raw) : undefined;
  const rerun = params.get('rerun') ?? undefined;
  return { preset, options, rerun };
}
