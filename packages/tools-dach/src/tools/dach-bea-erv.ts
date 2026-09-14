import { z } from 'zod';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  neoFileFromBytes,
  runTool,
} from '@neotools/engine';
import { DACH_LICENSES } from '../licenses.js';
import { AUTO_FIX_PIPELINE, checkErvFiles } from '../erv/check.js';

const options = z.object({
  autoFix: z.boolean().default(false),
  locale: z.enum(['de', 'en']).default('de'),
});

function markdown(report: Awaited<ReturnType<typeof checkErvFiles>>, locale: 'de' | 'en'): string {
  const lines = [
    locale === 'de' ? '# beA / ERV-Prüfung' : '# beA / ERV check',
    '',
    `Regelwerk ${report.ruleset.id} ${report.ruleset.version} — Ampel **${report.overall}**`,
    '',
    locale === 'de' ? 'Quellen: ERVV §2/§5, ERVB (konfigurierte Grenzen).' : 'Sources: ERVV §2/§5, ERVB (configured limits).',
    '',
  ];
  for (const file of report.files) {
    lines.push(`## ${file.name}`);
    for (const r of file.results) {
      lines.push(`- ${r.light} **${r.title[locale]}** (${r.source}): ${r.detail[locale]}`);
    }
    lines.push('');
  }
  lines.push(locale === 'de' ? '## Auto-Fix-Pipeline' : '## Auto-fix pipeline');
  lines.push('```json');
  lines.push(JSON.stringify(report.autoFixPipeline, null, 2));
  lines.push('```');
  return lines.join('\n') + '\n';
}

export const dachBeaErv = defineTool({
  id: 'dach-bea-erv',
  pack: 'dach',
  category: 'dach',
  title: { de: 'beA / ERV-Konformität', en: 'beA / ERV conformance' },
  description: {
    de: 'Prüft PDFs gegen ein versioniertes ERV-Regelwerk (Dateiname, Größe, JS, Formulare, PDF/A, Textlayer). Optional Auto-Fix-Pipeline über die Engine.',
    en: 'Checks PDFs against a versioned ERV rule set (name, size, JS, forms, PDF/A, text layer). Optional auto-fix pipeline via the engine.',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.json, MIME.md, MIME.pdf] },
  options,
  presets: [
    { id: 'check', title: { de: 'Nur prüfen', en: 'Check only' }, options: { autoFix: false } },
    { id: 'autofix', title: { de: 'Prüfen + Auto-Fix', en: 'Check + auto-fix' }, options: { autoFix: true } },
  ],
  licenses: DACH_LICENSES,
  seo: { keywords: ['bea', 'erv', 'ervv', 'elektronischer rechtsverkehr'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    ctx.progress(0.2, 'ERV');
    const report = await checkErvFiles(
      await Promise.all(files.map(async (f) => ({ name: f.name, size: f.size, bytes: await f.bytes() }))),
    );
    const outputs = [
      neoFileFromBytes('erv-report.json', new TextEncoder().encode(JSON.stringify(report, null, 2)), MIME.json),
      neoFileFromBytes('erv-report.md', new TextEncoder().encode(markdown(report, parsed.locale)), MIME.md),
    ];
    const warnings: string[] = [];
    if (parsed.autoFix) {
      ctx.progress(0.5, 'Auto-Fix');
      try {
        const { createPdfRegistry } = await import('@neotools/tools-pdf');
        const registry = createPdfRegistry();
        let current = files.filter((f) => f.mime === MIME.pdf || f.name.toLowerCase().endsWith('.pdf'));
        for (const step of AUTO_FIX_PIPELINE.steps) {
          const tool = registry.get(step.toolId);
          if (!tool) {
            warnings.push(`Auto-Fix: Tool ${step.toolId} fehlt.`);
            continue;
          }
          const pdfs = current.filter((f) => f.mime === MIME.pdf || f.name.toLowerCase().endsWith('.pdf'));
          if (!pdfs.length) break;
          const result = await runTool(tool, ctx, pdfs, step.options);
          current = result.outputs.filter((o) => o.mime === MIME.pdf);
          warnings.push(...result.warnings);
        }
        outputs.push(...current);
      } catch (err) {
        warnings.push(`Auto-Fix fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const provenance = await createProvenance('dach-bea-erv', parsed, files);
    return {
      outputs,
      warnings,
      report: attachProvenance(report as unknown as Record<string, unknown>, provenance),
    };
  },
});
