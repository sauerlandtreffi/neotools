import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { convertToPdfa } from '@neotools/tools-pdf';
import { sha256 } from '@neotools/engine';
import type { Platform } from '@neotools/engine';
import { toCsv } from '../util/csv.js';

export interface GobdFile {
  name: string;
  bytes: Uint8Array;
  origin: string;
}

export interface GobdManifestRow {
  name: string;
  hash: string;
  size: number;
  time: string;
  origin: string;
}

export async function buildGobdPackage(
  files: GobdFile[],
  opts: { convertPdfa: boolean; title: string; organization: string },
  platform: Platform,
): Promise<{ zip: Uint8Array; manifest: GobdManifestRow[] }> {
  const time = new Date().toISOString();
  const rows: GobdManifestRow[] = [];
  const zipFiles: Record<string, Uint8Array> = {};
  for (const file of files) {
    let bytes = file.bytes;
    let name = file.name.replace(/^\/+/, '').replace(/\\/g, '/');
    if (name.includes('..')) name = name.split('/').filter((p) => p !== '..').join('/');
    if (opts.convertPdfa && /\.pdf$/i.test(name)) {
      try {
        const conv = await convertToPdfa(bytes, { profile: '3b', rasterizeFallback: false }, platform);
        bytes = conv.bytes;
        if (!name.toLowerCase().endsWith('.pdf')) name += '.pdf';
      } catch {
        // keep original
      }
    }
    const hash = await sha256(bytes);
    rows.push({ name, hash, size: bytes.byteLength, time, origin: file.origin });
    zipFiles[`belege/${name}`] = bytes;
  }
  const manifestJson = JSON.stringify({ version: 1, title: opts.title, organization: opts.organization, files: rows }, null, 2);
  const manifestCsv = toCsv(['name', 'hash', 'size', 'time', 'origin'], rows as unknown as Array<Record<string, unknown>>);
  const doku = proceduralDoc(opts, rows);
  const indexPdf = await indexPdfBytes(opts.title, rows);
  zipFiles['manifest/manifest.json'] = strToU8(manifestJson);
  zipFiles['manifest/manifest.csv'] = strToU8(manifestCsv);
  zipFiles['doku/verfahrensdokumentation.md'] = strToU8(doku);
  zipFiles['index.pdf'] = indexPdf;
  return { zip: zipSync(zipFiles, { level: 6 }), manifest: rows };
}

export async function verifyGobdPackage(zipBytes: Uint8Array): Promise<{ ok: boolean; issues: string[] }> {
  const issues: string[] = [];
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zipBytes);
  } catch (err) {
    return { ok: false, issues: [`ZIP unlesbar: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const man = files['manifest/manifest.json'];
  if (!man) return { ok: false, issues: ['manifest/manifest.json fehlt'] };
  const parsed = JSON.parse(strFromU8(man)) as { files?: GobdManifestRow[] };
  for (const row of parsed.files ?? []) {
    const bytes = files[`belege/${row.name}`];
    if (!bytes) {
      issues.push(`fehlt: ${row.name}`);
      continue;
    }
    const hash = await sha256(bytes);
    if (hash !== row.hash) issues.push(`Hash abweichend: ${row.name}`);
  }
  return { ok: issues.length === 0, issues };
}

function proceduralDoc(opts: { title: string; organization: string }, rows: GobdManifestRow[]): string {
  return `# Verfahrensdokumentation (GoBD-Vorlage)

**Organisation:** ${opts.organization}
**Paket:** ${opts.title}
**erstellt:** ${new Date().toISOString()}
**Dateien:** ${rows.length}

## 1. Gegenstand
Dieses Paket enthält Belege im Originalformat (optional PDF/A) plus SHA-256-Manifest.

## 2. Unveränderbarkeit
Jeder Beleg ist im Manifest mit SHA-256, Größe und Herkunft verzeichnet. Änderungen werden im Prüfmodus erkannt.

## 3. Struktur
- \`/belege\` — Ursprungsdateien
- \`/manifest\` — JSON + CSV
- \`/doku\` — diese Vorlage
- \`index.pdf\` — Inhaltsverzeichnis

## 4. Hash-Liste
${rows.map((r) => `- \`${r.hash}\` ${r.name} (${r.size} B)`).join('\n')}
`;
}

async function indexPdfBytes(title: string, rows: GobdManifestRow[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595.28, 841.89]);
  let y = 800;
  page.drawText(`GoBD-Index: ${title}`, { x: 48, y, size: 14, font: bold, color: rgb(0.1, 0.15, 0.3) });
  y -= 24;
  for (const row of rows) {
    if (y < 48) {
      page = doc.addPage([595.28, 841.89]);
      y = 800;
    }
    page.drawText(`${row.name}  ${row.hash.slice(0, 16)}…`, { x: 48, y, size: 8, font });
    y -= 12;
  }
  return new Uint8Array(await doc.save({ updateFieldAppearances: false }));
}
