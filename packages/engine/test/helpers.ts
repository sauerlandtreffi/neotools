import { z } from 'zod';
import { defineTool } from '../src/define-tool.js';
import { neoFileFromBytes } from '../src/neo-file.js';
import { MIME } from '../src/types.js';
import type { NeoFile, ToolResult } from '../src/types.js';

export const dummyPdf = (name: string, payload = 'pdf'): NeoFile =>
  neoFileFromBytes(name, new TextEncoder().encode(payload), MIME.pdf);

export const dummyPng = (name: string): NeoFile =>
  neoFileFromBytes(name, new Uint8Array([137, 80, 78, 71]), MIME.png);

export function passthroughTool(
  id: string,
  accept = [MIME.pdf],
  output = [MIME.pdf],
) {
  return defineTool({
    id,
    pack: 'test',
    category: 'test',
    title: { de: id, en: id },
    description: { de: id, en: id },
    inputs: { accept, multiple: true },
    outputs: { mime: output },
    options: z.object({ label: z.string().default('') }),
    licenses: [],
    async run(_ctx, files): Promise<ToolResult> {
      return { outputs: files, warnings: [] };
    },
  });
}
