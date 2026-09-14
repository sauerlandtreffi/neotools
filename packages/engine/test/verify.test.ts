import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool } from '../src/define-tool.js';
import { createToolContext } from '../src/context.js';
import { neoFileFromBytes } from '../src/neo-file.js';
import { runTool, reloadOutputs } from '../src/run-tool.js';
import { MIME } from '../src/types.js';
import type { NeoFile, ToolResult, VerificationReport } from '../src/types.js';
import { dummyPdf } from './helpers.js';

describe('reloadOutputs', () => {
  it('returns a copy of the saved bytes, not the same buffer', async () => {
    const original = new Uint8Array([10, 20, 30]);
    const file = neoFileFromBytes('a.pdf', original, MIME.pdf);
    const [fresh] = await reloadOutputs([file]);
    const bytes = await fresh!.bytes();
    expect(bytes).toEqual(original);
    expect(bytes.buffer).not.toBe(original.buffer);
    bytes[0] = 99;
    expect(original[0]).toBe(10);
  });
});

describe('runTool verify hook', () => {
  it('reloads output bytes before verify and attaches report.verification', async () => {
    const seen: Uint8Array[] = [];
    const tool = defineTool({
      id: 'verify-demo',
      pack: 'test',
      category: 'privacy',
      title: { de: 'Demo', en: 'Demo' },
      description: { de: 'Demo', en: 'Demo' },
      inputs: { accept: [MIME.pdf], multiple: true },
      outputs: { mime: [MIME.pdf] },
      options: z.object({}),
      licenses: [],
      privacySensitive: true,
      async run(_ctx, files): Promise<ToolResult> {
        const bytes = new Uint8Array([1, 2, 3, 4]);
        return { outputs: [neoFileFromBytes(files[0]!.name, bytes, MIME.pdf)], warnings: [] };
      },
      async verify(_ctx, outputs): Promise<VerificationReport> {
        seen.push(await outputs[0]!.bytes());
        return { passed: true, checks: [{ id: 'fresh', passed: true, detail: 'reloaded' }] };
      },
    });

    const result = await runTool(tool, createToolContext(), [dummyPdf('in.pdf')], {});
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(result.report?.verification).toEqual({
      passed: true,
      checks: [{ id: 'fresh', passed: true, detail: 'reloaded' }],
    });
    expect(result.report?.sharedSafe).toBe(true);
  });

  it('fails closed when privacySensitive has no verify hook', async () => {
    const tool = defineTool({
      id: 'no-verify',
      pack: 'test',
      category: 'privacy',
      title: { de: 'x', en: 'x' },
      description: { de: 'x', en: 'x' },
      inputs: { accept: [MIME.pdf], multiple: false },
      options: z.object({}),
      licenses: [],
      privacySensitive: true,
      async run(_ctx, files): Promise<ToolResult> {
        return { outputs: files, warnings: [] };
      },
    });
    const result = await runTool(tool, createToolContext(), [dummyPdf('a.pdf')], {});
    const verification = result.report?.verification as VerificationReport;
    expect(verification.passed).toBe(false);
    expect(verification.checks[0]?.id).toBe('verify-missing');
    expect(result.report?.sharedSafe).toBe(false);
  });

  it('skips verification for ordinary tools', async () => {
    const tool = defineTool({
      id: 'plain',
      pack: 'test',
      category: 'test',
      title: { de: 'x', en: 'x' },
      description: { de: 'x', en: 'x' },
      inputs: { accept: [MIME.pdf], multiple: false },
      options: z.object({}),
      licenses: [],
      async run(_ctx, files): Promise<ToolResult> {
        return { outputs: files, warnings: [] };
      },
    });
    const result = await runTool(tool, createToolContext(), [dummyPdf('a.pdf')], {});
    expect(result.report?.verification).toBeUndefined();
  });
});

describe('verify isolation', () => {
  it('does not hand verify the same NeoFile instance as run', async () => {
    let runFile: NeoFile | undefined;
    let verifyFile: NeoFile | undefined;
    const tool = defineTool({
      id: 'identity-check',
      pack: 'test',
      category: 'privacy',
      title: { de: 'x', en: 'x' },
      description: { de: 'x', en: 'x' },
      inputs: { accept: [MIME.pdf], multiple: false },
      options: z.object({}),
      licenses: [],
      async run(_ctx, files): Promise<ToolResult> {
        runFile = files[0];
        return { outputs: files, warnings: [] };
      },
      async verify(_ctx, outputs): Promise<VerificationReport> {
        verifyFile = outputs[0];
        return { passed: true, checks: [{ id: 'ok', passed: true }] };
      },
    });
    const input = dummyPdf('iso.pdf');
    await runTool(tool, createToolContext(), [input], {});
    expect(runFile).toBe(input);
    expect(verifyFile).toBeDefined();
    expect(verifyFile).not.toBe(runFile);
  });
});
