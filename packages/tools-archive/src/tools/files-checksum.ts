import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes, sha256 } from '@neotools/engine';
import { ARCHIVE_CATEGORY, ARCHIVE_LICENSES } from '../licenses.js';
import { gatherFiles } from '../walk.js';
import { readAny } from '../zip-tar.js';

const options = z.object({
  mode: z.enum(['create', 'verify']).default('create'),
  rootPath: z.string().default(''),
});

export const filesChecksum = defineTool({
  id: 'files-checksum',
  pack: 'archive',
  category: ARCHIVE_CATEGORY,
  title: { de: 'SHA-256-Manifest', en: 'SHA-256 manifest' },
  description: {
    de: 'SHA-256-Manifest für Ordner oder ZIP erzeugen/prüfen (gleiche Idee wie forensics-hash, Ordner/ZIP-Modus).',
    en: 'Create/verify a SHA-256 manifest for a folder or ZIP (same idea as forensics-hash, folder/ZIP mode).',
  },
  inputs: { accept: ['*/*'], multiple: true, min: 1, directory: true },
  outputs: { mime: [MIME.json, 'text/plain'] },
  options,
  licenses: ARCHIVE_LICENSES,
  seo: { keywords: ['sha256sums', 'checksum'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    let items = await gatherFiles(files.filter((f) => !/sha256sums|manifest/i.test(f.name)), parsed.rootPath);
    const zip = items.find((f) => /\.zip$/i.test(f.name));
    if (zip && items.length === 1) {
      const inner = await readAny(await zip.bytes(), zip.name);
      items = Object.entries(inner.files).map(([n, b]) => neoFileFromBytes(n, b));
    }
    const rows = [];
    for (let i = 0; i < items.length; i++) {
      ctx.progress(i / items.length, items[i]!.name);
      rows.push({ file: items[i]!.name, sha256: await sha256(await items[i]!.bytes()), size: items[i]!.size });
    }
    const sums = rows.map((r) => `${r.sha256}  ${r.file}`).join('\n') + '\n';
    let verify;
    if (parsed.mode === 'verify') {
      const man = files.find((f) => /sha256sums|manifest/i.test(f.name));
      const expected = new Map<string, string>();
      if (man) {
        for (const line of new TextDecoder().decode(await man.bytes()).split(/\r?\n/)) {
          const m = /^\s*([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(line);
          if (m) expected.set(m[2]!.trim(), m[1]!.toLowerCase());
        }
      }
      verify = rows.map((r) => ({
        file: r.file,
        status: expected.get(r.file) === r.sha256 ? 'ok' : expected.has(r.file) ? 'mismatch' : 'extra',
      }));
    }
    return {
      outputs: [
        neoFileFromBytes('manifest.json', new TextEncoder().encode(JSON.stringify({ rows, verify }, null, 2)), MIME.json),
        neoFileFromBytes('SHA256SUMS', new TextEncoder().encode(sums), 'text/plain'),
      ],
      warnings: [],
      report: attachProvenance({ count: rows.length, verify }, await createProvenance('files-checksum', parsed, files)),
    };
  },
});
