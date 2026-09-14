import type { BatchFileResult, ToolDefinition, ToolResult } from '@neotools/engine';

export function printTable(rows: BatchFileResult[]): void {
  if (!rows.length) return;
  const width = Math.max(4, ...rows.map((r) => r.file.length));
  console.error(`${'FILE'.padEnd(width)}  STATUS  REASON`);
  for (const row of rows) {
    const reason = row.reason ?? '';
    console.error(`${row.file.padEnd(width)}  ${row.status.padEnd(6)}  ${reason}`);
  }
}

export function describeTool(tool: ToolDefinition, locale: 'de' | 'en' = 'de'): string {
  const lines = [
    `${tool.id}  [${tool.pack}/${tool.category}]`,
    tool.title[locale],
    tool.description[locale],
    `Inputs: ${tool.inputs.accept.join(', ')}  multiple=${tool.inputs.multiple}`,
    `Outputs: ${(tool.outputs?.mime ?? ['*']).join(', ')}`,
  ];
  return lines.join('\n');
}

export function jsonResult(result: ToolResult, outputs: string[]): string {
  return JSON.stringify(
    {
      ok: !hasBatchErrors(result),
      outputs,
      warnings: result.warnings,
      report: result.report ?? {},
    },
    null,
    2,
  );
}

export function hasBatchErrors(result: ToolResult): boolean {
  const batch = result.report?.['batch'] as BatchFileResult[] | undefined;
  return Boolean(batch?.some((b) => b.status === 'error'));
}

export function batchOf(result: ToolResult): BatchFileResult[] {
  return (result.report?.['batch'] as BatchFileResult[] | undefined) ?? [];
}
