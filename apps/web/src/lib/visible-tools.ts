import type { ToolDefinition } from '@neotools/engine';
import { branding, isHiddenTool } from './branding';
import { registry } from './registry';

/** Registered but not shown in the workshop grid (open / no licensed model). */
export const GRID_HIDDEN_TOOLS = new Set(['audio-stems']);

/** Live list so packs registered after this module loads still appear. */
export function listRegisteredTools(): ToolDefinition[] {
  return registry.list();
}

export function listPublicTools(hidden = branding.hiddenTools): ToolDefinition[] {
  const blocked = new Set([...hidden, ...GRID_HIDDEN_TOOLS]);
  return registry.list().filter((tool) => !blocked.has(tool.id));
}

export function publicToolPaths(hidden = branding.hiddenTools) {
  return listPublicTools(hidden).map((tool) => ({ params: { toolId: tool.id } }));
}

export { isHiddenTool };
