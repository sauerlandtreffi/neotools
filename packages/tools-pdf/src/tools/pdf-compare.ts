import { z } from 'zod';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  neoFileFromBytes,
} from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { stem } from '../pdf-io.js';
import { buildDiffPdf } from '../compare/diff-pdf.js';
import { comparePdfPixels } from '../compare/pixel.js';
import { buildCompareReport, compareMarkdown } from '../compare/report.js';
import { comparePdfText } from '../compare/text.js';

const options = z.object({
  mode: z.enum(['text', 'pixel', 'vertrag']).default('text'),
  layout: z.enum(['side-by-side', 'redline']).default('side-by-side'),
  locale: z.enum(['de', 'en']).default('de'),
  dpi: z.coerce.number().min(36).max(200).default(72),
});

export const pdfCompare = defineTool({
  id: 'pdf-compare',
  pack: 'pdf',
  category: 'compare',
  title: { de: 'PDF vergleichen', en: 'Compare PDFs' },
  description: {
    de: 'Zwei PDFs lokal vergleichen: Text-Diff, Pixel-Heatmap oder Vertrags-Preset. Ausgabe Diff-PDF, JSON und Markdown.',
    en: 'Compare two PDFs locally: text diff, pixel heatmap, or contract preset. Outputs a diff PDF, JSON and Markdown.',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 2, max: 2 },
  outputs: { mime: [MIME.pdf, MIME.json, MIME.md] },
  options,
  presets: [
    { id: 'text', title: { de: 'Text', en: 'Text' }, options: { mode: 'text', layout: 'redline' } },
    { id: 'pixel', title: { de: 'Pixel', en: 'Pixel' }, options: { mode: 'pixel', layout: 'side-by-side' } },
    { id: 'vertrag', title: { de: 'Vertrag', en: 'Contract' }, options: { mode: 'vertrag', layout: 'side-by-side' } },
  ],
  licenses: PDF_LICENSES,
  seo: {
    keywords: ['pdf vergleich', 'pdf compare', 'vertragsvergleich', 'redline'],
  },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    if (files.length !== 2) {
      return { outputs: [], warnings: ['Genau zwei PDF-Dateien erforderlich.'], report: { error: 'INPUT_COUNT' } };
    }
    const left = files[0]!;
    const right = files[1]!;
    ctx.progress(0.1, 'Text');
    const text = await comparePdfText(await left.bytes(), await right.bytes());
    let pixel;
    const wantPixel = parsed.mode === 'pixel' || parsed.mode === 'vertrag';
    if (wantPixel) {
      ctx.progress(0.5, 'Pixel');
      pixel = await comparePdfPixels(await left.bytes(), await right.bytes(), ctx.platform, text.alignment, parsed.dpi);
    }
    ctx.progress(0.8, 'Diff-PDF');
    const diffPdf = await buildDiffPdf(text, pixel, parsed.layout, { left: left.name, right: right.name });
    const report = buildCompareReport(parsed.mode, parsed.layout, left.name, right.name, text, pixel);
    const md = compareMarkdown(report, parsed.locale);
    const warnings: string[] = [];
    if (pixel?.skipped && pixel.reason) warnings.push(pixel.reason);
    const provenance = await createProvenance('pdf-compare', parsed, files);
    ctx.progress(1, 'Fertig');
    return {
      outputs: [
        neoFileFromBytes(`${stem(left.name)}-vs-${stem(right.name)}.pdf`, diffPdf, MIME.pdf),
        neoFileFromBytes('compare-report.json', new TextEncoder().encode(JSON.stringify(report, null, 2)), MIME.json),
        neoFileFromBytes('compare-report.md', new TextEncoder().encode(md), MIME.md),
      ],
      warnings,
      report: attachProvenance(report as unknown as Record<string, unknown>, provenance),
    };
  },
});
