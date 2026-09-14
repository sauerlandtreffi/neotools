import { describeWorkspaceTool, getAppliedPresets, zodObjectFields } from '@neotools/engine';
import { registry } from '../registry';
import { listPublicTools } from '../visible-tools';
import type { WorkspaceToolMeta } from './store';

/**
 * Build-time tool metadata for the /app island: workspace view + form fields +
 * presets per public tool. No registry / Zod is shipped to the main thread.
 */
export function workspaceToolsMeta(): WorkspaceToolMeta[] {
  const locked = getAppliedPresets(registry)?.locked ?? {};
  return listPublicTools().map((tool) => ({
    view: describeWorkspaceTool(tool),
    fields: zodObjectFields(tool.options),
    presets: (tool.presets ?? []).map((p) => ({ id: p.id, title: p.title, options: p.options as Record<string, unknown> })),
    lockedKeys: locked[tool.id] ?? [],
    inputs: { accept: [...tool.inputs.accept], multiple: Boolean(tool.inputs.multiple) },
  }));
}
