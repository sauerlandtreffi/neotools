import type { Registry } from './registry.js';
import { createProvenance, attachProvenance } from './provenance.js';
import { createToolContext, throwIfAborted } from './context.js';
import { runTool } from './run-tool.js';
import type {
  NeoFile,
  PipelineSpec,
  PipelineStep,
  PipelineTypeError,
  ToolContext,
  ToolResult,
} from './types.js';

export function mimeAccepted(mime: string, accept: string[]): boolean {
  for (const rule of accept) {
    if (rule === '*/*' || rule === mime) return true;
    if (rule.endsWith('/*') && mime.startsWith(rule.slice(0, -1))) return true;
  }
  return false;
}

/** Report/sidecar outputs (JSON reports) must not block the next convert/edit step. */
export const PIPELINE_SIDECAR_MIMES = new Set(['application/json']);

export function pipelinePayloadMimes(mimes: readonly string[]): string[] {
  return mimes.filter((mime) => !PIPELINE_SIDECAR_MIMES.has(mime));
}

export function validatePipeline(registry: Registry, spec: PipelineSpec): PipelineTypeError[] {
  const errors: PipelineTypeError[] = [];
  if (!spec.steps.length) {
    errors.push({ stepIndex: 0, toolId: '', message: 'Pipeline ist leer.' });
    return errors;
  }

  let previousMimes: string[] | null = null;

  spec.steps.forEach((step, index) => {
    const tool = registry.get(step.toolId);
    if (!tool) {
      errors.push({
        stepIndex: index,
        toolId: step.toolId,
        message: `Unbekanntes Tool: ${step.toolId}`,
      });
      previousMimes = null;
      return;
    }

    const parsed = tool.options.safeParse(step.options ?? {});
    if (!parsed.success) {
      errors.push({
        stepIndex: index,
        toolId: step.toolId,
        message: `Ungültige Optionen: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      });
    }

    if (previousMimes) {
      const incoming = pipelinePayloadMimes(previousMimes).filter(
        (m) => !step.whenMime?.length || mimeAccepted(m, step.whenMime),
      );
      const rejected = incoming.filter((m) => !mimeAccepted(m, tool.inputs.accept));
      for (const mime of rejected) {
        errors.push({
          stepIndex: index,
          toolId: step.toolId,
          message: `Schritt ${index + 1} akzeptiert kein ${mime} (MIME-Mismatch: vorher [${previousMimes.join(', ')}], Tool akzeptiert [${tool.inputs.accept.join(', ')}])`,
        });
      }
    }

    const emitted = pipelinePayloadMimes(tool.outputs?.mime ?? previousMimes ?? []);
    if (step.whenMime?.length && previousMimes) {
      const passthrough = previousMimes.filter((m) => !mimeAccepted(m, step.whenMime!));
      previousMimes = [...new Set([...(emitted ?? []), ...passthrough])];
    } else {
      previousMimes = emitted;
    }
  });

  return errors;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = globalThis.btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const bin = globalThis.atob(padded + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function serializePipeline(spec: PipelineSpec): string {
  return JSON.stringify(spec);
}

export function deserializePipeline(json: string): PipelineSpec {
  const parsed = JSON.parse(json) as PipelineSpec;
  if (!parsed || !Array.isArray(parsed.steps)) {
    throw new Error('Ungültige Pipeline.');
  }
  return parsed;
}

export function encodePipelineHash(spec: PipelineSpec): string {
  const json = serializePipeline(spec);
  const bytes = new TextEncoder().encode(json);
  return `#p=${bytesToBase64Url(bytes)}`;
}

export function decodePipelineHash(hash: string): PipelineSpec | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const p = params.get('p');
  if (!p) return null;
  const json = new TextDecoder().decode(base64UrlToBytes(p));
  return deserializePipeline(json);
}

export async function runPipeline(
  registry: Registry,
  spec: PipelineSpec,
  files: NeoFile[],
  ctx: ToolContext = createToolContext(),
): Promise<ToolResult> {
  const typeErrors = validatePipeline(registry, spec);
  if (typeErrors.length) {
    throw new Error(typeErrors.map((e) => `Schritt ${e.stepIndex + 1}: ${e.message}`).join('\n'));
  }

  let current = files;
  let last: ToolResult = { outputs: files, warnings: [] };
  const warnings: string[] = [];
  const reports: unknown[] = [];

  for (let i = 0; i < spec.steps.length; i++) {
    throwIfAborted(ctx.signal);
    const step = spec.steps[i]!;
    const tool = registry.require(step.toolId);
    const options = tool.options.parse(step.options ?? {});
    const selected = current.filter(
      (file) => !step.whenMime?.length || mimeAccepted(file.mime, step.whenMime),
    );
    const passthrough = current.filter(
      (file) => step.whenMime?.length && !mimeAccepted(file.mime, step.whenMime),
    );
    ctx.progress(i / spec.steps.length, tool.title.de);
    if (!selected.length) {
      current = passthrough;
      continue;
    }
    last = await runTool(tool, ctx, selected, options);
    const provenance = await createProvenance(tool.id, options, selected);
    last.report = attachProvenance(last.report, provenance);
    warnings.push(...last.warnings);
    if (last.report) reports.push({ toolId: tool.id, report: last.report });
    current = [...last.outputs, ...passthrough];
  }

  ctx.progress(1, 'Fertig');
  return {
    outputs: current,
    warnings,
    report: { steps: reports, batch: last.report?.['batch'] },
  };
}

export type { PipelineSpec, PipelineStep, PipelineTypeError };
