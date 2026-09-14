import { describe, expect, it } from 'vitest';
import { Registry } from '../src/registry.js';
import {
  decodePipelineHash,
  encodePipelineHash,
  mimeAccepted,
  runPipeline,
  validatePipeline,
} from '../src/pipeline.js';
import { MIME } from '../src/types.js';
import { dummyPdf, dummyPng, passthroughTool } from './helpers.js';

describe('Pipeline type check', () => {
  it('accepts matching mime chain', () => {
    const registry = new Registry()
      .register(passthroughTool('pdf-a', [MIME.pdf], [MIME.pdf]))
      .register(passthroughTool('pdf-b', [MIME.pdf], [MIME.pdf]));
    const errors = validatePipeline(registry, {
      steps: [
        { toolId: 'pdf-a', options: {} },
        { toolId: 'pdf-b', options: {} },
      ],
    });
    expect(errors).toEqual([]);
  });

  it('rejects mime mismatch', () => {
    const registry = new Registry()
      .register(passthroughTool('to-png', [MIME.pdf], [MIME.png]))
      .register(passthroughTool('needs-pdf', [MIME.pdf], [MIME.pdf]));
    const errors = validatePipeline(registry, {
      steps: [
        { toolId: 'to-png', options: {} },
        { toolId: 'needs-pdf', options: {} },
      ],
    });
    expect(errors.some((e) => e.message.includes('MIME-Mismatch'))).toBe(true);
    expect(errors.some((e) => e.message.includes('Schritt 2 akzeptiert kein image/png'))).toBe(true);
  });

  it('allows MIME-filter branches (pdf vs image)', () => {
    const registry = new Registry()
      .register(passthroughTool('split', [MIME.pdf, MIME.png], [MIME.pdf, MIME.png]))
      .register(passthroughTool('only-pdf', [MIME.pdf], [MIME.pdf]))
      .register(passthroughTool('only-png', [MIME.png], [MIME.png]));
    const errors = validatePipeline(registry, {
      steps: [
        { toolId: 'split', options: {} },
        { toolId: 'only-pdf', options: {}, whenMime: [MIME.pdf] },
        { toolId: 'only-png', options: {}, whenMime: [MIME.png] },
      ],
    });
    expect(errors).toEqual([]);
  });

  it('flags unknown tools', () => {
    const errors = validatePipeline(new Registry(), {
      steps: [{ toolId: 'ghost', options: {} }],
    });
    expect(errors[0]?.message).toMatch(/Unbekanntes Tool/);
  });

  it('mimeAccepted understands wildcards', () => {
    expect(mimeAccepted('image/png', ['image/*'])).toBe(true);
    expect(mimeAccepted('application/pdf', ['image/*'])).toBe(false);
  });

  it('ignores JSON report sidecars between PDF steps', () => {
    const registry = new Registry()
      .register(passthroughTool('sanitize', [MIME.pdf], [MIME.pdf, MIME.json]))
      .register(passthroughTool('compress', [MIME.pdf], [MIME.pdf, MIME.json]));
    const errors = validatePipeline(registry, {
      steps: [
        { toolId: 'sanitize', options: {} },
        { toolId: 'compress', options: {} },
      ],
    });
    expect(errors).toEqual([]);
  });
});

describe('Pipeline serialization', () => {
  it('roundtrips JSON and URL hash', () => {
    const spec = {
      steps: [
        { toolId: 'pdf-a', options: { label: 'x' } },
        { toolId: 'pdf-b', options: {} },
      ],
    };
    const hash = encodePipelineHash(spec);
    expect(hash.startsWith('#p=')).toBe(true);
    expect(decodePipelineHash(hash)).toEqual(spec);
    expect(decodePipelineHash(hash.slice(1))).toEqual(spec);
  });
});

describe('runPipeline', () => {
  it('threads outputs to the next step', async () => {
    const registry = new Registry()
      .register(passthroughTool('one'))
      .register(passthroughTool('two'));
    const result = await runPipeline(
      registry,
      {
        steps: [
          { toolId: 'one', options: {} },
          { toolId: 'two', options: {} },
        ],
      },
      [dummyPdf('a.pdf'), dummyPng('ignored.png')],
    );
    expect(result.outputs).toHaveLength(2);
    expect(result.report && 'steps' in result.report).toBe(true);
  });

  it('filters files by whenMime', async () => {
    const registry = new Registry()
      .register(passthroughTool('only-pdf', [MIME.pdf], [MIME.pdf]));
    const result = await runPipeline(
      registry,
      { steps: [{ toolId: 'only-pdf', options: {}, whenMime: [MIME.pdf] }] },
      [dummyPdf('a.pdf'), dummyPng('skip.png')],
    );
    expect(result.outputs.map((f) => f.name).sort()).toEqual(['a.pdf', 'skip.png']);
  });
});
