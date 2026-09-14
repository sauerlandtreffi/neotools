import { decodePipelineHash, parsePagesParam, parseTimeRangeParam, type PipelineSpec, type Selection } from '@neotools/engine';
import { decodeOptionsParam, encodeOptionsParam } from '../options-url';

export type WorkspaceMode = 'edit' | 'pipeline' | 'read' | 'batch';

/** Deep-link query of `/app` (FRONTEND-REDESIGN §6.5). Every field optional and composable. */
export interface WorkspaceQuery {
  session?: string;
  tool?: string;
  file?: string;
  preset?: string;
  options?: Record<string, unknown>;
  selection: Selection;
  mode: WorkspaceMode;
  pipeline?: PipelineSpec;
  /** `?desktop=1` — Tauri opened a file, read it via `read_opened_file`. */
  desktop: boolean;
  /** `?open=1` — PWA file handler / share target parked a file in the handoff slot. */
  handoff: boolean;
  /** `?panel=history|pipeline|watch` — open a program panel (old routes redirect here). */
  panel?: 'history' | 'pipeline' | 'watch';
}

const MODES: WorkspaceMode[] = ['edit', 'pipeline', 'read', 'batch'];
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/i;

function id(value: string | null): string | undefined {
  return value && ID_RE.test(value) ? value : undefined;
}

export function parseWorkspaceQuery(search = '', hash = ''): WorkspaceQuery {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const selection: Selection = {};
  const pages = parsePagesParam(params.get('pages'));
  if (pages.length) selection.pages = pages;
  const t = parseTimeRangeParam(params.get('t'));
  if (t) selection.timeRange = t;
  const rawMode = params.get('mode');
  const mode = MODES.includes(rawMode as WorkspaceMode) ? (rawMode as WorkspaceMode) : 'edit';
  const rawOptions = params.get('o');
  let pipeline: PipelineSpec | undefined;
  if (hash && hash.includes('p=')) {
    try {
      pipeline = decodePipelineHash(hash) ?? undefined;
    } catch {
      pipeline = undefined;
    }
  }
  return {
    session: id(params.get('session')),
    tool: id(params.get('tool')),
    file: id(params.get('file')),
    preset: id(params.get('preset')),
    options: rawOptions ? decodeOptionsParam(rawOptions) : undefined,
    selection,
    mode,
    pipeline,
    desktop: params.get('desktop') === '1',
    handoff: params.get('open') === '1',
    panel: (['history', 'pipeline', 'watch'] as const).find((p) => p === params.get('panel')),
  };
}

export function buildWorkspaceQuery(q: Partial<WorkspaceQuery> & { pages?: number[] }): string {
  const params = new URLSearchParams();
  if (q.session) params.set('session', q.session);
  if (q.tool) params.set('tool', q.tool);
  if (q.file) params.set('file', q.file);
  if (q.preset) params.set('preset', q.preset);
  if (q.options && Object.keys(q.options).length) params.set('o', encodeOptionsParam(q.options));
  if (q.mode && q.mode !== 'edit') params.set('mode', q.mode);
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Workspace path for a locale — the app lives on `/` (pivot §11); `/app` redirects there. */
export function workspacePath(locale: 'de' | 'en'): string {
  return locale === 'en' ? '/en' : '/';
}

/** Replace the URL without navigation so reload/bookmark keep session + tool. */
export function syncWorkspaceUrl(q: { session?: string; tool?: string | null; file?: string | null }): void {
  if (typeof history === 'undefined' || typeof location === 'undefined') return;
  const next = buildWorkspaceQuery({
    session: q.session,
    tool: q.tool ?? undefined,
    file: q.file ?? undefined,
  });
  const url = `${location.pathname}${next}${location.hash}`;
  if (url !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(history.state, '', url);
}
