import type { z } from 'zod';
import { mimeAccepted } from './pipeline.js';
import type { Registry } from './registry.js';
import type { Localized, ToolDefinition } from './types.js';

/** Canvas family a document belongs to (FRONTEND-REDESIGN §2.7). */
export type WorkspaceFamily = 'pdf' | 'image' | 'media' | 'office' | 'archive' | 'data';

export type SelectionKind = 'pages' | 'region' | 'timeRange' | 'fileIds' | 'textQuery';

export type WorkspaceVerb = 'transform' | 'inspect' | 'protect' | 'export' | 'compare';

export interface ToolWorkspaceMeta {
  family: WorkspaceFamily | readonly WorkspaceFamily[];
  /** ActionBar rank, smaller = further left. */
  priority?: number;
  /** Grouping in ⌘K and overflow. */
  verb?: WorkspaceVerb;
  /** Selection kinds the tool needs before it can run. */
  requires?: readonly SelectionKind[];
  /** Irreversible / privacy relevant — UI shows the warning head. */
  destructive?: boolean;
  /** Can produce a preview without a full encode. */
  previewable?: boolean;
  /** Only available on the desktop app (e.g. signing with local keys). */
  desktopOnly?: boolean;
  /** Needs two or more tray files (merge, compare). */
  multiFile?: boolean;
}

export interface Finding {
  id: string;
  /** 'iban' | 'js' | 'attachment' | 'exif-gps' | … */
  kind: string;
  severity: 'info' | 'warn' | 'high';
  label: Localized;
  /** Selection to jump to / act on (pages, regions…). */
  selection?: unknown;
  suggestedToolId?: string;
  suggestedOptions?: unknown;
  /** Number of occurrences summarized by this finding. */
  count?: number;
}

export interface PreviewRequest {
  toolId: string;
  options: unknown;
  selection?: unknown;
  /** e.g. only page 3 at 72 dpi */
  window: { page?: number; width?: number; startSec?: number; durationSec?: number };
}

export interface PreviewFrame {
  mime: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  data: Uint8Array;
  note?: Localized;
}

const FAMILY_BY_MIME: Array<[RegExp, WorkspaceFamily]> = [
  [/^application\/pdf$/, 'pdf'],
  [/^image\//, 'image'],
  [/^(video|audio)\//, 'media'],
  [/officedocument|msword|ms-excel|ms-powerpoint|opendocument|epub\+zip|^text\/markdown$|^text\/html$/, 'office'],
  [/zip|tar|gzip|7z|rar|compressed/, 'archive'],
  [/^(text\/|application\/(json|xml|yaml|x-yaml|csv))/, 'data'],
];

/** Heuristic when a tool/file declares no family. */
export function familyForMime(mime: string): WorkspaceFamily | null {
  for (const [re, fam] of FAMILY_BY_MIME) if (re.test(mime)) return fam;
  return null;
}

export function toolFamilies(tool: ToolDefinition<z.ZodTypeAny>): WorkspaceFamily[] {
  const declared = tool.workspace?.family;
  if (declared) return Array.isArray(declared) ? [...declared] : [declared as WorkspaceFamily];
  const out = new Set<WorkspaceFamily>();
  for (const rule of tool.inputs.accept) {
    if (rule === '*/*') continue;
    const fam = familyForMime(rule.endsWith('/*') ? `${rule.slice(0, -2)}/x` : rule);
    if (fam) out.add(fam);
  }
  return [...out];
}

export function toolAcceptsMime(tool: ToolDefinition<z.ZodTypeAny>, mime: string): boolean {
  return mimeAccepted(mime, tool.inputs.accept);
}

const DEFAULT_PRIORITY: Record<string, number> = {
  'pdf-compress': 10,
  'pdf-reorder': 20,
  'pdf-rotate': 30,
  'pdf-split': 40,
  'pdf-merge': 50,
  'pdf-redact': 60,
  'pdf-sanitize': 70,
  'pdf-ocr': 80,
  'pdf-forms': 90,
  'pdf-lock': 100,
  'pdf-watermark': 110,
  'pdf-a': 120,
  'pdf-sign': 130,
};

export function toolPriority(tool: ToolDefinition<z.ZodTypeAny>): number {
  return tool.workspace?.priority ?? DEFAULT_PRIORITY[tool.id] ?? 1000;
}

export interface WorkspaceToolView {
  id: string;
  title: Localized;
  description: Localized;
  priority: number;
  verb: WorkspaceVerb;
  requires: SelectionKind[];
  destructive: boolean;
  previewable: boolean;
  desktopOnly: boolean;
  multiFile: boolean;
  privacySensitive: boolean;
  family: WorkspaceFamily[];
}

export function describeWorkspaceTool(tool: ToolDefinition<z.ZodTypeAny>): WorkspaceToolView {
  const ws = tool.workspace;
  return {
    id: tool.id,
    title: tool.title,
    description: tool.description,
    priority: toolPriority(tool),
    verb: ws?.verb ?? (tool.category === 'privacy' ? 'protect' : 'transform'),
    requires: [...(ws?.requires ?? [])],
    destructive: Boolean(ws?.destructive ?? tool.privacySensitive),
    previewable: Boolean(ws?.previewable ?? tool.preview),
    desktopOnly: Boolean(ws?.desktopOnly),
    multiFile: Boolean(ws?.multiFile),
    privacySensitive: Boolean(tool.privacySensitive),
    family: toolFamilies(tool),
  };
}

/**
 * Tools that can act on a document of `mime`, ranked for the ActionBar.
 * `hidden` (branding.hiddenTools) are removed, everything else stays visible
 * (locks are shown as locks, not hidden — §2.8).
 */
export function workspaceToolsFor(
  registry: Registry,
  mime: string,
  opts: { hidden?: Iterable<string>; family?: WorkspaceFamily | null } = {},
): WorkspaceToolView[] {
  const hidden = new Set(opts.hidden ?? []);
  const family = opts.family === undefined ? familyForMime(mime) : opts.family;
  return registry
    .list()
    .filter((tool) => !hidden.has(tool.id))
    .filter((tool) => toolAcceptsMime(tool, mime))
    .filter((tool) => !family || toolFamilies(tool).length === 0 || toolFamilies(tool).includes(family))
    .map(describeWorkspaceTool)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

/**
 * Lint helper (ENG-01): every tool should declare `outputs.mime`; tools that
 * appear in the workspace should carry `workspace` meta. Returns human-readable
 * issues, never throws — used by tests and `neotools doctor`.
 */
export function lintToolDefinition(tool: ToolDefinition<z.ZodTypeAny>): string[] {
  const issues: string[] = [];
  if (!tool.outputs?.mime?.length) issues.push(`${tool.id}: outputs.mime fehlt`);
  if (tool.workspace) {
    const fams = toolFamilies(tool);
    if (!fams.length) issues.push(`${tool.id}: workspace.family leer`);
    if (tool.workspace.priority !== undefined && !(tool.workspace.priority >= 0)) {
      issues.push(`${tool.id}: workspace.priority ungültig`);
    }
  }
  return issues;
}
