import { z } from 'zod';
import { attachProvenance, createProvenance, mapFiles, neoFileFromBytes } from '@neotools/engine';
import type { Locale, NeoFile, ToolContext, ToolResult } from '@neotools/engine';
import { FORENSICS_LICENSES } from '../licenses.js';
import { MIME_MD, reportFiles } from '../util/report.js';

export const localeOpt = z.enum(['de', 'en']).default('de');

export function forensicsOptions<T extends z.ZodRawShape>(shape: T) {
  return z.object({ locale: localeOpt, ...shape });
}

export { FORENSICS_LICENSES, reportFiles, MIME_MD };

export async function withBatchReports(
  ctx: ToolContext,
  files: NeoFile[],
  toolId: string,
  options: unknown,
  fn: (file: NeoFile, index: number, locale: Locale) => Promise<{ json: unknown; extraOutputs?: NeoFile[] }>,
  markdown: (rows: unknown[], locale: Locale) => string,
  stem: string,
): Promise<ToolResult> {
  const locale = (options as { locale?: Locale }).locale ?? 'de';
  const rows: unknown[] = [];
  const extra: NeoFile[] = [];
  const mapped = await mapFiles(files, async (file, i) => {
    ctx.progress((i + 0.5) / Math.max(files.length, 1), file.name);
    const r = await fn(file, i, locale);
    rows.push(r.json);
    if (r.extraOutputs) extra.push(...r.extraOutputs);
    return r.json;
  });
  const payload = { files: rows, batch: mapped.protocol };
  const outputs = [...reportFiles(stem, payload, markdown(rows, locale)), ...extra];
  const provenance = await createProvenance(toolId, options, files);
  return {
    outputs,
    warnings: mapped.errors.map((e) => `${e.file}: ${e.reason}`),
    report: attachProvenance(payload, provenance),
  };
}

export function jsonFile(name: string, data: unknown): NeoFile {
  return neoFileFromBytes(name, new TextEncoder().encode(JSON.stringify(data, null, 2)), 'application/json');
}
