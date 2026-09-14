import { ENGINE_VERSION, createProvenance } from '@neotools/engine';
import type { NeoFile, ProvenanceManifest } from '@neotools/engine';
import { hashAll } from '../util/hashes.js';
import { identifyBytes } from '../identify/identify.js';

export interface FileProvenance {
  name: string;
  size: number;
  sha256: string;
  sha512: string;
  blake3: string;
  identify?: { id: string; mime: string };
}

export interface ForensicsProvenanceManifest extends ProvenanceManifest {
  engineVersion: string;
  files: FileProvenance[];
}

export interface ProvenanceVerify {
  ok: boolean;
  rows: Array<{ file: string; status: 'ok' | 'mismatch' | 'missing' | 'extra'; expected?: string; actual?: string }>;
}

export async function createForensicsProvenance(files: NeoFile[]): Promise<ForensicsProvenanceManifest> {
  const base = await createProvenance('forensics-provenance', { mode: 'create' }, files);
  const listed: FileProvenance[] = [];
  for (const file of files) {
    const bytes = await file.bytes();
    const hashes = hashAll(bytes);
    const id = identifyBytes(bytes, file.name, file.mime);
    listed.push({
      name: file.name,
      size: file.size,
      ...hashes,
      identify: id.primary ? { id: id.primary.id, mime: id.primary.mime } : undefined,
    });
  }
  return { ...base, engineVersion: ENGINE_VERSION, files: listed };
}

export function parseProvenanceJson(text: string): ForensicsProvenanceManifest {
  const raw = JSON.parse(text) as ForensicsProvenanceManifest;
  if (!raw || !Array.isArray(raw.files)) throw new Error('Ungültiges Provenance-Manifest.');
  return raw;
}

export async function verifyForensicsProvenance(
  files: NeoFile[],
  manifest: ForensicsProvenanceManifest,
): Promise<ProvenanceVerify> {
  const rows: ProvenanceVerify['rows'] = [];
  const byName = new Map(manifest.files.map((f) => [f.name, f]));
  const seen = new Set<string>();
  for (const file of files) {
    const bytes = await file.bytes();
    const actual = hashAll(bytes).sha256;
    const exp = byName.get(file.name);
    if (!exp) {
      rows.push({ file: file.name, status: 'extra', actual });
      continue;
    }
    seen.add(file.name);
    rows.push({
      file: file.name,
      status: exp.sha256 === actual && exp.size === file.size ? 'ok' : 'mismatch',
      expected: exp.sha256,
      actual,
    });
  }
  for (const f of manifest.files) {
    if (!seen.has(f.name)) rows.push({ file: f.name, status: 'missing', expected: f.sha256 });
  }
  return { ok: rows.every((r) => r.status === 'ok'), rows };
}

export function provenanceMarkdown(
  locale: 'de' | 'en',
  created?: ForensicsProvenanceManifest,
  verify?: ProvenanceVerify,
): string {
  const lines = [locale === 'de' ? '# Provenance\n' : '# Provenance\n'];
  if (created) {
    lines.push(`- **engine:** ${created.engineVersion}`);
    lines.push(`- **time:** ${created.timestamp}`);
    for (const f of created.files) {
      lines.push(`- ${f.name}: \`${f.sha256}\` (${f.size} B, ${f.identify?.id ?? '?'})`);
    }
  }
  if (verify) {
    lines.push('', locale === 'de' ? '## Prüfung' : '## Verify', `- **ok:** ${verify.ok}`);
    for (const r of verify.rows) lines.push(`- ${r.file}: ${r.status}`);
  }
  return lines.join('\n') + '\n';
}
