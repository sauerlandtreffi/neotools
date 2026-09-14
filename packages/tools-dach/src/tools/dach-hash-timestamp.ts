import { z } from 'zod';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  neoFileFromBytes,
} from '@neotools/engine';
import { DACH_LICENSES } from '../licenses.js';
import { digestHex } from '../hash/digest.js';
import { buildTimeStampReq, postTimestamp, verifyTsrAgainstHash } from '../hash/rfc3161.js';

const options = z.object({
  mode: z.enum(['hash', 'timestamp', 'verify']).default('hash'),
  algorithms: z.array(z.enum(['sha256', 'sha512'])).default(['sha256', 'sha512']),
  tsaUrl: z.string().default(''),
  locale: z.enum(['de', 'en']).default('de'),
});

async function nachweisPdf(manifest: Record<string, unknown>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  page.drawText('Nachweisblatt — Dokument-Hash', { x: 56, y: 780, size: 16, font: bold, color: rgb(0.1, 0.15, 0.25) });
  const json = JSON.stringify(manifest, null, 2);
  let y = 740;
  for (const line of json.split('\n').slice(0, 40)) {
    page.drawText(line.slice(0, 90), { x: 56, y, size: 8, font, color: rgb(0.15, 0.15, 0.15) });
    y -= 12;
    if (y < 60) break;
  }
  return new Uint8Array(await doc.save({ updateFieldAppearances: false }));
}

export const dachHashTimestamp = defineTool({
  id: 'dach-hash-timestamp',
  pack: 'dach',
  category: 'dach',
  title: { de: 'Dokument-Hash + Zeitstempel', en: 'Document hash + timestamp' },
  description: {
    de: 'SHA-256/512, optional RFC-3161 (TSA-URL, Default offline). Ausgabe Manifest, Nachweisblatt-PDF, .tsq/.tsr.',
    en: 'SHA-256/512, optional RFC 3161 (TSA URL, default offline). Outputs manifest, evidence PDF, .tsq/.tsr.',
  },
  inputs: { accept: ['*/*'], multiple: true, min: 1 },
  outputs: { mime: [MIME.json, MIME.pdf, 'application/timestamp-query', 'application/timestamp-reply'] },
  options,
  presets: [
    { id: 'hash', title: { de: 'Nur Hash', en: 'Hash only' }, options: { mode: 'hash' } },
    { id: 'verify', title: { de: 'TSR prüfen', en: 'Verify TSR' }, options: { mode: 'verify' } },
  ],
  licenses: DACH_LICENSES,
  seo: { keywords: ['sha-256', 'rfc 3161', 'zeitstempel', 'tsa'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const docs = files.filter((f) => !/\.(tsr|tsq)$/i.test(f.name));
    const tsrFile = files.find((f) => /\.tsr$/i.test(f.name));
    const rows = [];
    for (const file of docs.length ? docs : files) {
      ctx.progress(0.3, file.name);
      const bytes = await file.bytes();
      const sha256 = parsed.algorithms.includes('sha256') ? await digestHex('SHA-256', bytes) : undefined;
      const sha512 = parsed.algorithms.includes('sha512') ? await digestHex('SHA-512', bytes) : undefined;
      rows.push({ file: file.name, size: file.size, sha256, sha512 });
    }
    const manifest: Record<string, unknown> = {
      version: 1,
      createdAt: new Date().toISOString(),
      files: rows,
      tsaUrl: parsed.tsaUrl || null,
      offline: !parsed.tsaUrl,
    };
    const outputs = [
      neoFileFromBytes('hash-manifest.json', new TextEncoder().encode(JSON.stringify(manifest, null, 2)), MIME.json),
      neoFileFromBytes('nachweisblatt.pdf', await nachweisPdf(manifest), MIME.pdf),
    ];
    const warnings: string[] = [];
    if (parsed.mode === 'timestamp') {
      if (!parsed.tsaUrl) {
        warnings.push('Keine TSA-URL — offline, kein Netzwerkaufruf.');
      } else {
        const first = docs[0] ?? files[0]!;
        const raw = await first.bytes();
        const copy = new Uint8Array(raw.byteLength);
        copy.set(raw);
        const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', copy.buffer));
        const tsq = await buildTimeStampReq(hash);
        const tsr = await postTimestamp(parsed.tsaUrl, tsq);
        outputs.push(neoFileFromBytes('request.tsq', tsq, 'application/timestamp-query'));
        outputs.push(neoFileFromBytes('reply.tsr', tsr, 'application/timestamp-reply'));
        manifest.timestamp = verifyTsrAgainstHash(tsr, hash);
      }
    }
    if (parsed.mode === 'verify' && tsrFile) {
      const first = docs[0] ?? files[0]!;
      const raw = await first.bytes();
      const copy = new Uint8Array(raw.byteLength);
      copy.set(raw);
      const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', copy.buffer));
      const check = verifyTsrAgainstHash(await tsrFile.bytes(), hash);
      manifest.verify = check;
      if (!check.ok) warnings.push(check.detail);
    }
    const provenance = await createProvenance('dach-hash-timestamp', parsed, files);
    return {
      outputs,
      warnings,
      report: attachProvenance(manifest, provenance),
    };
  },
});
