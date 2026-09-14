import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, mapFiles, neoFileFromBytes } from '@neotools/engine';
import { IMAGE_ACCEPT, IMAGE_AI_LICENSES } from '../licenses.js';
import { decodeFile, stem } from './common.js';
import { writeImageDescription } from '../meta-write.js';
import { captionImage, translateEnDe } from '../models/transformers.js';
import { ModelMissingError } from '../models/errors.js';

const options = z.object({
  lang: z.enum(['de', 'en', 'both']).default('both'),
  format: z.enum(['csv', 'json']).default('csv'),
  writeExif: z.boolean().default(false),
  confirmModelDownload: z.boolean().default(false),
});

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const imageAltText = defineTool({
  id: 'image-alt-text',
  pack: 'a11y',
  category: 'ai',
  title: { de: 'Alt-Text lokal', en: 'Local alt text' },
  description: {
    de: 'Bildbeschreibung lokal (ViT-GPT2, Apache-2.0), Übersetzung ins Deutsche (OPUS-MT). CSV/JSON.',
    en: 'Local captions (ViT-GPT2, Apache-2.0), German via OPUS-MT. CSV/JSON.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['text/csv', MIME.json] },
  options,
  presets: [
    { id: 'csv-de', title: { de: 'CSV Deutsch', en: 'CSV German' }, options: { lang: 'de', format: 'csv' } },
    { id: 'json', title: { de: 'JSON', en: 'JSON' }, options: { format: 'json', lang: 'both' } },
  ],
  licenses: IMAGE_AI_LICENSES,
  seo: { keywords: ['alt text', 'barrierefreiheit', 'bildbeschreibung'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const rows: Array<{ file: string; altEn: string; altDe: string; warning?: string }> = [];
    const tagged: ReturnType<typeof neoFileFromBytes>[] = [];
    const mapped = await mapFiles(files, async (file, i) => {
      ctx.progress(i / Math.max(files.length, 1), file.name);
      const img = await decodeFile(file);
      try {
        const cap = await captionImage(img, ctx.platform, ctx, parsed.confirmModelDownload);
        let de = cap.en;
        if (parsed.lang !== 'en') {
          const tr = await translateEnDe(cap.en, ctx.platform, ctx, parsed.confirmModelDownload);
          de = tr.de;
        }
        const row = { file: file.name, altEn: cap.en, altDe: de, warning: cap.warning };
        rows.push(row);
        if (parsed.writeExif) {
          const description = parsed.lang === 'en' ? cap.en : de || cap.en;
          const written = writeImageDescription(await file.bytes(), file.name, img, description);
          if (written) tagged.push(neoFileFromBytes(file.name, written.bytes, written.mime));
          else row.warning = [row.warning, 'EXIF/XMP nur für JPEG/PNG/WebP.'].filter(Boolean).join(' ');
        }
        return row;
      } catch (err) {
        const msg = err instanceof ModelMissingError ? err.message : err instanceof Error ? err.message : String(err);
        rows.push({ file: file.name, altEn: '', altDe: '', warning: msg });
        throw new Error(msg);
      }
    });
    const warnings = mapped.errors.map((e) => `${e.file}: ${e.reason}`);
    let bytes: Uint8Array;
    let name: string;
    let mime: string;
    if (parsed.format === 'json') {
      bytes = new TextEncoder().encode(JSON.stringify(rows, null, 2));
      name = 'alt-text.json';
      mime = MIME.json;
    } else {
      const header = 'filename,alt_en,alt_de,warning\n';
      const body = rows
        .map((r) => [r.file, r.altEn, r.altDe, r.warning ?? ''].map(csvEscape).join(','))
        .join('\n');
      bytes = new TextEncoder().encode(header + body + '\n');
      name = 'alt-text.csv';
      mime = 'text/csv';
    }
    const provenance = await createProvenance('image-alt-text', parsed, files);
    return {
      outputs: [neoFileFromBytes(name, bytes, mime), ...tagged],
      warnings,
      report: attachProvenance({ batch: mapped.protocol, rows }, provenance),
    };
  },
});

export { stem };
