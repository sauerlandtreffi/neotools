import { z } from 'zod';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  neoFileFromBytes,
  type VerificationReport,
} from '@neotools/engine';
import { PDFDocument } from 'pdf-lib';
import { PDF_LICENSES } from '../licenses.js';
import { stem } from '../pdf-io.js';
import { convertToPdfa } from '../pdfa/convert.js';
import { validatePdfa } from '../pdfa/validate.js';
import type { PdfaProfile } from '../pdfa/types.js';

const options = z.object({
  mode: z.enum(['validate', 'convert']).default('validate'),
  profile: z.enum(['2b', '3b']).default('2b'),
  rasterizeFallback: z.boolean().default(false),
  locale: z.enum(['de', 'en']).default('de'),
});

function reportMarkdown(report: Awaited<ReturnType<typeof validatePdfa>>, locale: 'de' | 'en'): string {
  const lines = [
    locale === 'de' ? `# PDF/A-${report.profile} (Teilmenge)` : `# PDF/A-${report.profile} (subset)`,
    '',
    report.subset,
    '',
    `**${report.passed ? (locale === 'de' ? 'bestanden' : 'passed') : locale === 'de' ? 'fehlgeschlagen' : 'failed'}**`,
    '',
  ];
  for (const f of [...report.errors, ...report.warnings, ...report.hints]) {
    const msg = f.message[locale];
    lines.push(`- **${f.severity}** \`${f.id}\` (${f.clause}): ${msg}`);
  }
  return lines.join('\n') + '\n';
}

export const pdfA = defineTool({
  id: 'pdf-a',
  pack: 'pdf',
  category: 'archive',
  title: { de: 'PDF/A prüfen & wandeln', en: 'PDF/A validate & convert' },
  description: {
    de: 'Eigene Regelmaschine für PDF/A-2b/3b (ohne veraPDF/Ghostscript). Best-effort-Konvertierung mit XMP, sRGB-OutputIntent und erneuter Validierung.',
    en: 'Own rule engine for PDF/A-2b/3b (no veraPDF/Ghostscript). Best-effort convert with XMP, sRGB OutputIntent, then re-validate.',
  },
  inputs: { accept: [MIME.pdf], multiple: false, min: 1, max: 1 },
  outputs: { mime: [MIME.pdf, MIME.json, MIME.md] },
  options,
  presets: [
    { id: 'validate-2b', title: { de: 'Prüfen 2b', en: 'Validate 2b' }, options: { mode: 'validate', profile: '2b' } },
    { id: 'convert-2b', title: { de: 'Wandeln 2b', en: 'Convert 2b' }, options: { mode: 'convert', profile: '2b' } },
    { id: 'convert-3b', title: { de: 'Wandeln 3b', en: 'Convert 3b' }, options: { mode: 'convert', profile: '3b' } },
  ],
  licenses: PDF_LICENSES,
  seo: { keywords: ['pdf/a', 'pdfa', 'archivierung', 'iso 19005'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const file = files[0];
    if (!file) return { outputs: [], warnings: ['Keine PDF.'], report: {} };
    ctx.progress(0.2, parsed.mode);
    const profile = parsed.profile as PdfaProfile;
    const warnings: string[] = [];
    let outBytes: Uint8Array | undefined;
    let report;
    if (parsed.mode === 'convert') {
      const conv = await convertToPdfa(await file.bytes(), { profile, rasterizeFallback: parsed.rasterizeFallback }, ctx.platform);
      outBytes = conv.bytes;
      report = conv.report;
      warnings.push(...conv.warnings);
    } else {
      report = await validatePdfa(await file.bytes(), profile, ctx.platform);
    }
    const md = reportMarkdown(report, parsed.locale);
    const outputs = [
      neoFileFromBytes('pdfa-report.json', new TextEncoder().encode(JSON.stringify(report, null, 2)), MIME.json),
      neoFileFromBytes('pdfa-report.md', new TextEncoder().encode(md), MIME.md),
    ];
    if (outBytes) {
      outputs.unshift(neoFileFromBytes(`${stem(file.name)}-pdfa-${profile}.pdf`, outBytes, MIME.pdf));
    }
    const provenance = await createProvenance('pdf-a', parsed, files);
    return {
      outputs,
      warnings,
      report: attachProvenance({ pdfa: report }, provenance),
    };
  },
  async verify(ctx, outputs, opts) {
    const parsed = options.parse(opts);
    const pdf = outputs.find((o) => o.mime === MIME.pdf);
    if (parsed.mode === 'validate') {
      return { passed: true, checks: [{ id: 'validate-only', passed: true, detail: 'Kein Konvertierungs-Output.' }] };
    }
    if (!pdf) {
      return { passed: false, checks: [{ id: 'pdfa-output', passed: false, detail: 'Kein PDF-Output.' }] };
    }
    const report = await validatePdfa(await pdf.bytes(), parsed.profile as PdfaProfile, ctx.platform);
    const checks: VerificationReport['checks'] = report.errors.map((e) => ({
      id: e.id,
      passed: false,
      detail: e.message.de,
    }));
    if (!checks.length) checks.push({ id: 'pdfa-ok', passed: true, detail: `PDF/A-${parsed.profile} Teilmenge ohne Fehler.` });
    return { passed: report.passed, checks };
  },
});

export async function isPdfaGreen(bytes: Uint8Array, profile: PdfaProfile, platform: import('@neotools/engine').Platform) {
  const r = await validatePdfa(bytes, profile, platform);
  return r.passed;
}

void PDFDocument;
