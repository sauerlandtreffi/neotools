import { parentPort, workerData } from 'node:worker_threads';
import { createToolContext, neoFileFromBytes, runPipeline, runTool } from '@neotools/engine';
import { nodePlatformReady } from '@neotools/engine/platform/node';
import { createBaseRegistry } from './registry.js';

async function main(): Promise<void> {
  const data = workerData as {
    kind: 'run' | 'pipeline';
    toolId?: string;
    spec?: { steps: Array<{ toolId: string; options: unknown; whenMime?: string[] }> };
    options?: unknown;
    files: Array<{ name: string; mime: string; data: Uint8Array }>;
  };
  const registry = createBaseRegistry();
  const platform = await nodePlatformReady();
  const files = data.files.map((f) => neoFileFromBytes(f.name, f.data, f.mime));
  const ctx = createToolContext({ platform });
  const result =
    data.kind === 'pipeline'
      ? await runPipeline(registry, data.spec!, files, ctx)
      : await runTool(registry.require(data.toolId!), ctx, files, data.options ?? {});
  const outputs = [];
  for (const file of result.outputs) {
    outputs.push({ name: file.name, mime: file.mime, data: await file.bytes() });
  }
  parentPort?.postMessage({ ok: true, result: { outputs, warnings: result.warnings, report: result.report } });
}

main().catch((err) => {
  parentPort?.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
});
