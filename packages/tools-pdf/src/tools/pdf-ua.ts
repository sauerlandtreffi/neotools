import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes } from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { inspectPdfUa } from '../ua/inspect.js';
import { repairPdfUa } from '../ua/repair.js';
import { stem } from '../pdf-io.js';

const options = z.object({
  mode: z.enum(['check', 'repair']).default('check'),
  lang: z.string().default('de-DE'),
  title: z.string().default(''),
  autoTag: z.boolean().default(false),
});

function reportMd(findings: Awaited<ReturnType<typeof inspectPdfUa>>, notes: string[]): string {
  const lines = ['# PDF-UA / BITV (best-effort)', '', 'Kein veraPDF. Auto-Tagging schreibt **keine** MCIDs in Content-Streams.', ''];
  for (const f of findings) {
    const mark = f.passed ? 'OK' : f.severity.toUpperCase();
    lines.push(`- **${mark}** \`${f.id}\` (${f.clause}${f.wcag ? `, ${f.wcag}` : ''}): ${f.message.de}`);
  }
  if (notes.length) {
    lines.push('', '## Reparatur', '', ...notes.map((n) => `- ${n}`));
  }
  return lines.join('\n') + '\n';
}

export const pdfUa = defineTool({
  id: 'pdf-ua',
  pack: 'pdf',
  category: 'a11y',
  title: { de: 'PDF-UA / BITV prüfen', en: 'PDF-UA / BITV check' },
  description: {
    de: 'PDF-UA/BITV prüfen (Tags, Lang, Titel, Tab-Order, OCR-Hinweis). Reparatur best-effort, kein falsch-grün.',
    en: 'Check PDF-UA/BITV (tags, lang, title, tab order, OCR hint). Repair is best-effort, never false-green.',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf, MIME.json, MIME.md] },
  options,
  licenses: PDF_LICENSES,
  seo: { keywords: ['pdf-ua', 'bitv', 'barrierefreiheit'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const outputs: ReturnType<typeof neoFileFromBytes>[] = [];
    const warnings: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      ctx.progress(i / files.length, file.name);
      let bytes = await file.bytes();
      const before = await inspectPdfUa(bytes);
      const notes: string[] = [];
      if (parsed.mode === 'repair') {
        const repaired = await repairPdfUa(bytes, { lang: parsed.lang, title: parsed.title, tag: parsed.autoTag });
        bytes = repaired.bytes;
        notes.push(...repaired.notes);
        outputs.push(neoFileFromBytes(`${stem(file.name)}-ua.pdf`, bytes, MIME.pdf));
      }
      const after = parsed.mode === 'repair' ? await inspectPdfUa(bytes) : before;
      const payload = { before, after, notes, honest: 'Repair without content-stream tagging is incomplete.' };
      outputs.push(neoFileFromBytes(`${stem(file.name)}-ua.json`, new TextEncoder().encode(JSON.stringify(payload, null, 2)), MIME.json));
      outputs.push(neoFileFromBytes(`${stem(file.name)}-ua.md`, new TextEncoder().encode(reportMd(after, notes)), MIME.md));
      if (after.some((f) => !f.passed && f.severity === 'error')) {
        warnings.push(`${file.name}: PDF-UA-Fehler verbleiben (siehe Report).`);
      }
    }
    return {
      outputs,
      warnings,
      report: attachProvenance({ files: files.length }, await createProvenance('pdf-ua', parsed, files)),
    };
  },
});
