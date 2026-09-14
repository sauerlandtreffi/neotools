import type { NeoFile } from '@neotools/engine';
import { HASH_ALGS, hashBytes, hashFile, type HashAlg } from '../util/hashes.js';

export interface FileDigest {
  file: string;
  size: number;
  sha256?: string;
  sha512?: string;
  blake3?: string;
}

export interface ManifestVerifyRow {
  file: string;
  status: 'ok' | 'mismatch' | 'missing' | 'extra';
  expected?: string;
  actual?: string;
}

export function parseSha256Sums(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (m) map.set(m[2]!.trim(), m[1]!.toLowerCase());
  }
  return map;
}

export function formatSha256Sums(rows: FileDigest[]): string {
  return rows
    .filter((r) => r.sha256)
    .map((r) => `${r.sha256}  ${r.file}`)
    .join('\n');
}

export async function digestFiles(files: NeoFile[], algs: HashAlg[]): Promise<FileDigest[]> {
  const out: FileDigest[] = [];
  for (const file of files) {
    const row: FileDigest = { file: file.name, size: file.size };
    const bytes = file.size < 8_000_000 ? await file.bytes() : undefined;
    for (const alg of algs) {
      const hex = bytes ? hashBytes(alg, bytes) : await hashFile(alg, file);
      row[alg] = hex;
    }
    out.push(row);
  }
  return out;
}

export function verifyManifest(digests: FileDigest[], expected: Map<string, string>): ManifestVerifyRow[] {
  const rows: ManifestVerifyRow[] = [];
  const seen = new Set<string>();
  for (const [name, hash] of expected) {
    const got = digests.find((d) => d.file === name || d.file.endsWith(name));
    if (!got) {
      rows.push({ file: name, status: 'missing', expected: hash });
      continue;
    }
    seen.add(got.file);
    const actual = got.sha256;
    rows.push({
      file: got.file,
      status: actual === hash ? 'ok' : 'mismatch',
      expected: hash,
      actual,
    });
  }
  for (const d of digests) {
    if (!seen.has(d.file) && !expected.has(d.file)) {
      rows.push({ file: d.file, status: 'extra', actual: d.sha256 });
    }
  }
  return rows;
}

export function hashMarkdown(
  digests: FileDigest[],
  locale: 'de' | 'en',
  verify?: ManifestVerifyRow[],
): string {
  const lines = [locale === 'de' ? '# Hashes\n' : '# Hashes\n'];
  for (const d of digests) {
    lines.push(`## ${d.file} (${d.size} B)`);
    if (d.sha256) lines.push(`- SHA-256: \`${d.sha256}\``);
    if (d.sha512) lines.push(`- SHA-512: \`${d.sha512}\``);
    if (d.blake3) lines.push(`- BLAKE3: \`${d.blake3}\``);
    lines.push('');
  }
  if (verify) {
    lines.push(locale === 'de' ? '## Verify\n' : '## Verify\n');
    for (const v of verify) {
      lines.push(`- ${v.file}: **${v.status}**`);
    }
  }
  return lines.join('\n');
}

export { HASH_ALGS };
export type { HashAlg };
