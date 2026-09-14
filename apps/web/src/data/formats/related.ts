import type { ToolDefinition } from '@neotools/engine';
import { mimeAccepted } from '@neotools/engine';
import { FORMAT_CATALOG } from './catalog';
import { canonicalFormatId, type FormatRecord } from './schema';

export function formatMatchesAccept(format: FormatRecord, accept: readonly string[]): boolean {
  for (const rule of accept) {
    if (format.mime.some((mime) => mimeAccepted(mime, [rule]))) return true;
    const lower = rule.toLowerCase();
    if (lower.startsWith('.') && format.extensions.includes(lower)) return true;
    if (format.extensions.includes(`.${canonicalFormatId(lower)}`)) return true;
    if (canonicalFormatId(lower) === format.id) return true;
  }
  return false;
}

export function formatMatchesMimeList(format: FormatRecord, mimes: readonly string[] | undefined): boolean {
  if (!mimes?.length) return false;
  return mimes.some((mime) => format.mime.includes(mime) || canonicalFormatId(mime) === format.id);
}

export function formatsAccepting(accept: readonly string[]): FormatRecord[] {
  return FORMAT_CATALOG.filter((format) => formatMatchesAccept(format, accept));
}

export function formatsEmitting(mimes: readonly string[] | undefined): FormatRecord[] {
  if (!mimes?.length) return [];
  return FORMAT_CATALOG.filter((format) => formatMatchesMimeList(format, mimes));
}

export function relatedToolIds(format: FormatRecord, tools: readonly ToolDefinition[]): string[] {
  const auto: string[] = [];
  for (const tool of tools) {
    if (formatMatchesAccept(format, tool.inputs.accept) || formatMatchesMimeList(format, tool.outputs?.mime)) {
      auto.push(tool.id);
    }
  }
  return [...new Set([...auto, ...format.relatedToolsExtra])];
}

export function formatsForTool(tool: ToolDefinition): { inputs: FormatRecord[]; outputs: FormatRecord[] } {
  return {
    inputs: formatsAccepting(tool.inputs.accept),
    outputs: formatsEmitting(tool.outputs?.mime),
  };
}
