import type { APIRoute } from 'astro';
import { getAppliedPresets, zodObjectFields } from '@neotools/engine';
import { resolvePipelineLibrary } from '../lib/pipeline-library';
import { registry } from '../lib/registry';
import { listPublicTools } from '../lib/visible-tools';

/** Catalogue for the Automate (pipeline) panel — formerly inlined into /pipeline. */
export const GET: APIRoute = () => {
  const applied = getAppliedPresets(registry);
  const catalog = listPublicTools().map((tool) => ({
    id: tool.id,
    title: tool.title,
    fields: zodObjectFields(tool.options),
    accept: tool.inputs.accept,
    outputs: tool.outputs?.mime ?? [],
    pack: tool.pack,
    lockedKeys: applied?.locked?.[tool.id] ?? [],
  }));
  const library = resolvePipelineLibrary(registry);
  const required = Object.entries(applied?.requiredPipelines ?? {}).map(([name, tools]) => ({ name, tools }));
  return new Response(JSON.stringify({ catalog, library, required }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
};
