import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { applyTeamPresets, type Registry } from '@neotools/engine';
import { verifyBytes, parsePublicKey, bytesToBase64Url, base64UrlToBytes } from '@neotools/license';

export async function loadPresetsFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as unknown;
}

export function extractPresetsSignature(doc: unknown): { sig: string; publicKey?: string; body: unknown } | undefined {
  if (!doc || typeof doc !== 'object') return undefined;
  const o = doc as Record<string, unknown>;
  if (typeof o.signature === 'string' || typeof o.sig === 'string') {
    const { signature: _s, sig: _s2, ...rest } = o;
    return { sig: typeof o.signature === 'string' ? o.signature : String(o.sig), body: rest };
  }
  if (o.signature && typeof o.signature === 'object') {
    const nested = o.signature as { sig?: string; publicKey?: string };
    const { signature: _s, ...rest } = o;
    if (nested.sig) return { sig: nested.sig, publicKey: nested.publicKey, body: rest };
  }
  return undefined;
}

export async function verifyPresetsSignature(doc: unknown, publicKey: string): Promise<boolean> {
  const extracted = extractPresetsSignature(doc);
  if (!extracted?.sig || !publicKey) return false;
  const msg = new TextEncoder().encode(canonicalJson(extracted.body));
  let sigBytes: Uint8Array;
  try {
    sigBytes =
      /^[0-9a-fA-F]+$/.test(extracted.sig) && extracted.sig.length === 128
        ? Uint8Array.from(extracted.sig.match(/../g)!.map((h) => Number.parseInt(h, 16)))
        : base64UrlToBytes(extracted.sig);
  } catch {
    return false;
  }
  return verifyBytes(sigBytes, msg, parsePublicKey(publicKey));
}

export function applyPresetsIfPresent(registry: Registry, presets: unknown | undefined): Registry {
  if (!presets) return registry;
  try {
    return applyTeamPresets(registry, presets);
  } catch {
    return registry;
  }
}

export function encodePresetsFragment(presets: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(presets)));
}

export { loadPresetsFile as readPresetsJson };

/** Canonical JSON matching `@neotools/tools-dach` team-preset signatures. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(rec[k])}`).join(',')}}`;
}
