import { ENGINE_VERSION } from './types.js';
import type { NeoFile, ProvenanceManifest } from './types.js';

export function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256(data: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest('SHA-256', data as BufferSource);
    return hex(new Uint8Array(digest));
  }
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(data).digest('hex');
}

export async function hashFiles(files: NeoFile[]): Promise<string[]> {
  const hashes: string[] = [];
  for (const file of files) {
    hashes.push(await sha256(await file.bytes()));
  }
  return hashes;
}

export async function createProvenance(
  toolId: string,
  options: unknown,
  sources: NeoFile[],
  version = ENGINE_VERSION,
): Promise<ProvenanceManifest> {
  return {
    toolId,
    version,
    options,
    sourceSha256: await hashFiles(sources),
    timestamp: new Date().toISOString(),
  };
}

export function attachProvenance(
  report: Record<string, unknown> | undefined,
  manifest: ProvenanceManifest,
): Record<string, unknown> {
  return { ...(report ?? {}), provenance: manifest };
}
