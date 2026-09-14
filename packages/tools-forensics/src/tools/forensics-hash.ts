import { z } from 'zod';
import { defineTool, MIME, neoFileFromBytes } from '@neotools/engine';
import { digestFiles, formatSha256Sums, hashMarkdown, parseSha256Sums, verifyManifest } from '../hash/hash.js';
import { FORENSICS_LICENSES, forensicsOptions, localeOpt } from './common.js';
import { attachProvenance, createProvenance } from '@neotools/engine';
import { utf8 } from '../util/bytes.js';

const options = z.object({
  locale: localeOpt,
  mode: z.enum(['hash', 'verify']).default('hash'),
  algorithms: z.array(z.enum(['sha256', 'sha512', 'blake3'])).default(['sha256', 'sha512', 'blake3']),
});

export const forensicsHash = defineTool({
  id: 'forensics-hash',
  pack: 'forensics',
  category: 'forensics',
  title: { de: 'Hashes / Manifest', en: 'Hashes / manifest' },
  description: {
    de: 'SHA-256, SHA-512 und BLAKE3, Manifest im SHA256SUMS-Format, optional Verify.',
    en: 'SHA-256, SHA-512 and BLAKE3, SHA256SUMS manifest, optional verify.',
  },
  inputs: { accept: ['*/*'], multiple: true, min: 1 },
  outputs: { mime: ['application/json', 'text/markdown', 'text/plain'] },
  options,
  presets: [
    { id: 'hash', title: { de: 'Hashen', en: 'Hash' }, options: { mode: 'hash' } },
    { id: 'verify', title: { de: 'Manifest prüfen', en: 'Verify manifest' }, options: { mode: 'verify' } },
  ],
  licenses: FORENSICS_LICENSES,
  seo: { keywords: ['sha256', 'blake3', 'checksum', 'sha256sums'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const manifestLike = files.filter((f) => /sha256sums|manifest|\.json$/i.test(f.name));
    const targets = parsed.mode === 'verify' ? files.filter((f) => !manifestLike.includes(f)) : files;
    ctx.progress(0.2, 'hash');
    const digests = await digestFiles(targets.length ? targets : files, parsed.algorithms);
    let verify;
    if (parsed.mode === 'verify') {
      const man = manifestLike[0] ?? files[files.length - 1];
      if (man) {
        const text = new TextDecoder().decode(await man.bytes());
        try {
          const json = JSON.parse(text) as { files?: Array<{ file: string; sha256?: string }> };
          const map = new Map<string, string>();
          for (const row of json.files ?? []) if (row.sha256) map.set(row.file, row.sha256);
          verify = verifyManifest(digests, map.size ? map : parseSha256Sums(text));
        } catch {
          verify = verifyManifest(digests, parseSha256Sums(text));
        }
      }
    }
    const payload = { digests, verify };
    const sums = formatSha256Sums(digests);
    const outputs = [
      neoFileFromBytes('hashes.json', utf8(JSON.stringify(payload, null, 2)), MIME.json),
      neoFileFromBytes('hashes.md', utf8(hashMarkdown(digests, parsed.locale, verify)), 'text/markdown'),
      neoFileFromBytes('SHA256SUMS', utf8(sums + (sums.endsWith('\n') ? '' : '\n')), 'text/plain'),
    ];
    return {
      outputs,
      warnings: [],
      report: attachProvenance(payload, await createProvenance('forensics-hash', parsed, files)),
    };
  },
});
