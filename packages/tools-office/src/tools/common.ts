import { z } from 'zod';
import {
  attachProvenance,
  createProvenance,
  defineTool,
  neoFileFromBytes,
  type NeoFile,
  type ToolContext,
  type ToolDefinition,
} from '@neotools/engine';
import { OFFICE_LICENSES } from '../licenses.js';

export const pageOpt = z.enum(['a4', 'letter']).default('a4');
export const themeOpt = z.enum(['default', 'github', 'academic']).default('default');

export function officeTool<O extends z.ZodTypeAny>(def: ToolDefinition<O>): ToolDefinition<O> {
  return defineTool({
    ...def,
    pack: 'office',
    licenses: def.licenses?.length ? def.licenses : OFFICE_LICENSES,
  });
}

export async function finish(
  ctx: ToolContext,
  toolId: string,
  files: readonly NeoFile[],
  options: unknown,
  outputs: NeoFile[],
  warnings: string[] = [],
  extra: Record<string, unknown> = {},
) {
  void ctx;
  const provenance = await createProvenance(toolId, options, [...files]);
  return {
    outputs,
    warnings,
    report: attachProvenance(extra, provenance),
  };
}

export function outFile(name: string, data: Uint8Array, mime: string): NeoFile {
  return neoFileFromBytes(name, data, mime);
}

export async function firstText(file: NeoFile): Promise<string> {
  return new TextDecoder().decode(await file.bytes());
}

export function requireFile(files: readonly NeoFile[], message = 'Keine Eingabedatei.'): NeoFile {
  const f = files[0];
  if (!f) throw new Error(message);
  return f;
}
