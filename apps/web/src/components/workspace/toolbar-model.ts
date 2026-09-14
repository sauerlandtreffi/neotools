import type { WorkspaceVerb } from '@neotools/engine';
import type { WKey } from '../../lib/workspace/i18n';
import { activeFile, familyOf, tools, type WorkspaceToolMeta } from '../../lib/workspace/store';
import type { SessionFileMeta } from '../../lib/workspace/types';

/** Toolbar group order (pivot §11.1/3): Convert·Edit · Protect·Redact · Inspect·Analyse · Compare · Export. */
export const VERB_ORDER: WorkspaceVerb[] = ['transform', 'protect', 'inspect', 'compare', 'export'];

export function verbLabelKey(verb: WorkspaceVerb): WKey {
  switch (verb) {
    case 'protect':
      return 'verbProtect';
    case 'inspect':
      return 'verbInspect';
    case 'compare':
      return 'verbCompare';
    case 'export':
      return 'verbExport';
    default:
      return 'verbTransform';
  }
}

export function acceptsMime(accept: readonly string[], mime: string): boolean {
  return accept.some((rule) => rule === '*/*' || rule === mime || (rule.endsWith('/*') && mime.startsWith(rule.slice(0, -1))));
}

/** Every registered tool that can act on `file` — nothing hard-coded, ranked by priority. */
export function toolsForFile(file: SessionFileMeta | null, all: WorkspaceToolMeta[] = tools.value): WorkspaceToolMeta[] {
  if (!file) return [];
  const fam = familyOf(file);
  return all
    .filter((t) => acceptsMime(t.inputs.accept, file.mime))
    .filter((t) => !fam || !t.view.family.length || t.view.family.includes(fam))
    .sort((a, b) => a.view.priority - b.view.priority || a.view.id.localeCompare(b.view.id));
}

export interface ToolGroup {
  verb: WorkspaceVerb;
  tools: WorkspaceToolMeta[];
}

export function groupTools(list: WorkspaceToolMeta[]): ToolGroup[] {
  const map = new Map<WorkspaceVerb, WorkspaceToolMeta[]>();
  for (const t of list) {
    const verb = (t.view.verb ?? 'transform') as WorkspaceVerb;
    const bucket = map.get(verb) ?? [];
    bucket.push(t);
    map.set(verb, bucket);
  }
  return VERB_ORDER.filter((v) => map.has(v)).map((verb) => ({ verb, tools: map.get(verb)! }));
}

export function groupedToolsForActive(): ToolGroup[] {
  return groupTools(toolsForFile(activeFile.value));
}
