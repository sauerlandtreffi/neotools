import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool } from '../src/define-tool.js';
import { runPipeline } from '../src/pipeline.js';
import { neoFileFromBytes } from '../src/neo-file.js';
import { Registry } from '../src/registry.js';
import { MIME } from '../src/types.js';
import {
  describeWorkspaceTool,
  familyForMime,
  lintToolDefinition,
  toolFamilies,
  workspaceToolsFor,
} from '../src/workspace.js';
import { dummyPdf, passthroughTool } from './helpers.js';

describe('workspace meta', () => {
  it('maps mimes to families', () => {
    expect(familyForMime('application/pdf')).toBe('pdf');
    expect(familyForMime('image/png')).toBe('image');
    expect(familyForMime('video/mp4')).toBe('media');
    expect(familyForMime(MIME.docx)).toBe('office');
    expect(familyForMime('application/zip')).toBe('archive');
    expect(familyForMime('text/csv')).toBe('data');
    expect(familyForMime('application/octet-stream')).toBeNull();
  });

  it('derives families from inputs.accept when workspace is missing (legacy tools)', () => {
    const legacy = passthroughTool('legacy', [MIME.pdf, 'image/*']);
    expect(toolFamilies(legacy).sort()).toEqual(['image', 'pdf']);
    expect(describeWorkspaceTool(legacy)).toMatchObject({ priority: 1000, verb: 'transform', destructive: false });
  });

  it('ranks tools for a mime with declared priority first and drops hidden ones', () => {
    const reg = new Registry();
    reg.register(passthroughTool('pdf-zzz'));
    reg.register(
      defineTool({
        ...passthroughTool('pdf-first'),
        workspace: { family: 'pdf', priority: 1, verb: 'protect', requires: ['pages'], destructive: true },
      }),
    );
    reg.register(passthroughTool('pdf-compress'));
    reg.register(passthroughTool('img-only', ['image/png'], ['image/png']));
    reg.register(passthroughTool('hidden-one'));
    const list = workspaceToolsFor(reg, MIME.pdf, { hidden: ['hidden-one'] });
    expect(list.map((t) => t.id)).toEqual(['pdf-first', 'pdf-compress', 'pdf-zzz']);
    expect(list[0]).toMatchObject({ requires: ['pages'], destructive: true, verb: 'protect' });
  });

  it('lints missing outputs and empty families', () => {
    const noOut = defineTool({
      id: 'no-out',
      pack: 't',
      category: 't',
      title: { de: 'x', en: 'x' },
      description: { de: 'x', en: 'x' },
      inputs: { accept: ['*/*'], multiple: false },
      options: z.object({}),
      licenses: [],
      workspace: { family: [] },
      async run() {
        return { outputs: [], warnings: [] };
      },
    });
    expect(lintToolDefinition(noOut)).toEqual(['no-out: outputs.mime fehlt', 'no-out: workspace.family leer']);
    expect(lintToolDefinition(passthroughTool('ok'))).toEqual([]);
  });
});

describe('runPipeline handles', () => {
  it('passes a document handle through ctx and reports intermediate handles', async () => {
    const reg = new Registry();
    const seenGenerations: number[] = [];
    const bump = defineTool({
      ...passthroughTool('bump'),
      async run(ctx, files) {
        seenGenerations.push(ctx.document?.generation ?? -1);
        const bytes = await files[0]!.bytes();
        return { outputs: [neoFileFromBytes('out.pdf', new Uint8Array([...bytes, 33]), MIME.pdf)], warnings: [] };
      },
    });
    reg.register(bump);
    const steps: number[] = [];
    const result = await runPipeline(
      reg,
      { steps: [{ toolId: 'bump', options: {} }, { toolId: 'bump', options: {}, selection: { pages: [1] } }] },
      [dummyPdf('a.pdf', 'ab')],
      undefined,
      {
        onStep: ({ index, handles }) => {
          steps.push(index);
          expect(handles).toHaveLength(1);
          expect(handles[0]!.generation).toBe(index + 1);
        },
      },
    );
    expect(seenGenerations).toEqual([0, 1]);
    expect(steps).toEqual([0, 1]);
    expect((await result.outputs[0]!.bytes()).byteLength).toBe(4);
  });
});
