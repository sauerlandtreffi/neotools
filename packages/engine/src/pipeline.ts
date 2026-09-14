import type { Registry } from './registry.js';
import { createProvenance, attachProvenance } from './provenance.js';
import { createToolContext, throwIfAborted } from './context.js';
import { runTool } from './run-tool.js';
import { advanceHandle, handleFromBytes, type DocumentHandle } from './document-handle.js';
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

export interface PipelineRunHooks {
  /**
   * Called after each executed step with the intermediate outputs as document
   * handles (workspace snapshots / step stack). Skipped steps are not reported.
   */
  onStep?(info: {
    index: number;
    toolId: string;
    handles: DocumentHandle[];
    result: ToolResult;
  }): void | Promise<void>;
}

export async function runPipeline(
  registry: Registry,
  spec: PipelineSpec,
  files: NeoFile[],
  ctx: ToolContext = createToolContext(),
  hooks: PipelineRunHooks = {},
): Promise<ToolResult> {
  const typeErrors = validatePipeline(registry, spec);
  if (typeErrors.length) {
    throw new Error(typeErrors.map((e) => `Schritt ${e.stepIndex + 1}: ${e.message}`).join('\n'));
  }

  let current = files;
  let last: ToolResult = { outputs: files, warnings: [] };
  const warnings: string[] = [];
  const reports: unknown[] = [];
  // One logical handle per input, carried across steps so packs may reuse `parsed`.
  let handles: DocumentHandle[] = await Promise.all(
    files.map(async (f) => handleFromBytes(f.name, await f.bytes(), f.mime)),
  );

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
    const stepCtx: ToolContext = selected.length === 1 && handles[0] ? { ...ctx, document: handles[0] } : ctx;
    last = await runTool(tool, stepCtx, selected, options);
    const provenance = await createProvenance(tool.id, options, selected);
    last.report = attachProvenance(last.report, provenance);
    warnings.push(...last.warnings);
    if (last.report) reports.push({ toolId: tool.id, report: last.report });
    current = [...last.outputs, ...passthrough];
    handles = await nextHandles(handles, last.outputs);
    if (hooks.onStep) await hooks.onStep({ index: i, toolId: tool.id, handles, result: last });
  }

  ctx.progress(1, 'Fertig');
  return {
    outputs: current,
    warnings,
    report: { steps: reports, batch: last.report?.['batch'] },
  };
}

/** Advance the primary handle with the first payload output; extra outputs become fresh handles. */
async function nextHandles(previous: DocumentHandle[], outputs: NeoFile[]): Promise<DocumentHandle[]> {
  const payload = outputs.filter((o) => !PIPELINE_SIDECAR_MIMES.has(o.mime));
  const out: DocumentHandle[] = [];
  for (let i = 0; i < payload.length; i++) {
    const file = payload[i]!;
    const bytes = await file.bytes();
    const prev = previous[i];
    out.push(
      prev
        ? advanceHandle(prev, { name: file.name, mime: file.mime, bytes })
        : handleFromBytes(file.name, bytes, file.mime),
    );
  }
  return out;
}

export type { PipelineSpec, PipelineStep, PipelineTypeError };
