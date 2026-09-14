import { batch, computed, signal } from '@preact/signals';
import {
  encodePipelineHash,
  familyForMime,
  formatPages,
  type Finding,
  type FormField,
  type PipelineSpec,
  type Selection,
  type VerificationReport,
  type WorkspaceToolView,
} from '@neotools/engine';
import type { Locale } from '../i18n';
import type { WorkerFileRef } from '../../worker/tool-worker';
import { analyzeJob, runPipelineJob, runToolJob, subscribeJobs, warmFamily } from './pool';
import { syncWorkspaceUrl } from './router';
import { sniffMime, workspaceKind, type WorkspaceKind } from './sniff';
import { getSessionStore, opfsPathOf, type SessionStore } from './session-store';
import {
  canRedo as stackCanRedo,
  canUndo as stackCanUndo,
  currentName,
  currentRef,
  jumpTo as stackJump,
  newStepRecord,
  pushStep,
  redo as stackRedo,
  toPipelineSpec,
  undo as stackUndo,
} from './step-stack';
import {
  INLINE_TRANSFER_LIMIT,
  type ExportSpec,
  type JobView,
  type SessionFileMeta,
  type SessionMeta,
  type StepRecord,
  type Toast,
} from './types';

/** Build-time tool metadata handed to the SPA (no registry in the main thread). */
export interface WorkspaceToolMeta {
  view: WorkspaceToolView;
  fields: FormField[];
  presets: Array<{ id: string; title: Record<Locale, string>; options: Record<string, unknown> }>;
  lockedKeys: string[];
  inputs: { accept: string[]; multiple: boolean };
}

export type Sheet = 'tray' | 'stack' | 'options' | null;
export type RedactMode = 'text' | 'rect' | 'search';

export interface RedactMark {
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  source: 'text' | 'rect' | 'search' | 'auto' | 'finding';
  pattern?: string;
  text?: string;
  selected: boolean;
}

export interface WorkspaceState {
  ready: boolean;
  locale: Locale;
  desktop: boolean;
  session: SessionMeta | null;
  selectedFileIds: string[];
  selection: Selection;
  pendingToolId: string | null;
  pendingOptions: Record<string, unknown>;
  page: number;
  zoom: number;
  search: string;
  redactMode: RedactMode;
  marks: RedactMark[];
  exportOpen: boolean;
  mergeOpen: boolean;
  batchOpen: boolean;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  diffStepId: string | null;
  sheet: Sheet;
  policyLabel: string | null;
  error: string | null;
  recent: Array<{ id: string; name: string; updatedAt: number; steps: number }>;
  /** Program-like shell (pivot §11): panels + fullscreen/overview + embedded panels. */
  binOpen: boolean;
  inspectorOpen: boolean;
  /** true ⇒ the user asked for the overview page while a session has files (shell not expanded). */
  overview: boolean;
  panel: Panel;
  menu: string | null;
}

export type Panel = 'history' | 'pipeline' | 'watch' | null;

export function emptyWorkspace(locale: Locale = 'de'): WorkspaceState {
  return {
    ready: false,
    locale,
    desktop: false,
    session: null,
    selectedFileIds: [],
    selection: {},
    pendingToolId: null,
    pendingOptions: {},
    page: 1,
    zoom: 1,
    search: '',
    redactMode: 'text',
    marks: [],
    exportOpen: false,
    mergeOpen: false,
    batchOpen: false,
    paletteOpen: false,
    shortcutsOpen: false,
    diffStepId: null,
    sheet: null,
    policyLabel: null,
    error: null,
    recent: [],
    binOpen: true,
    inspectorOpen: true,
    overview: false,
    panel: null,
    menu: null,
  };
}

const LAYOUT_KEY = 'nt.ws.layout';
function readLayout(): Partial<Pick<WorkspaceState, 'binOpen' | 'inspectorOpen'>> {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<Pick<WorkspaceState, 'binOpen' | 'inspectorOpen'>> = {};
    if (typeof parsed.binOpen === 'boolean') out.binOpen = parsed.binOpen;
    if (typeof parsed.inspectorOpen === 'boolean') out.inspectorOpen = parsed.inspectorOpen;
    return out;
  } catch {
    return {};
  }
}

/** Toggle/set the side panels; persisted so the program remembers its layout. */
export function setLayout(p: Partial<Pick<WorkspaceState, 'binOpen' | 'inspectorOpen'>>): void {
  patch(p);
  try {
    const { binOpen, inspectorOpen } = workspace.value;
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ binOpen, inspectorOpen }));
  } catch {
    // private mode
  }
}

export const workspace = signal<WorkspaceState>(emptyWorkspace());
export const tools = signal<WorkspaceToolMeta[]>([]);
export const jobs = signal<JobView[]>([]);
export const toasts = signal<Toast[]>([]);
/** Bytes revision counter: bump when the active head bytes change so canvases reload. */
export const headVersion = signal(0);

export const activeFile = computed<SessionFileMeta | null>(() => {
  const s = workspace.value.session;
  if (!s) return null;
  return s.files.find((f) => f.id === s.activeFileId) ?? s.files[0] ?? null;
});

export const activeRef = computed(() => (activeFile.value ? currentRef(activeFile.value) : null));
export const activeName = computed(() => (activeFile.value ? currentName(activeFile.value) : null));
export const canUndo = computed(() => (activeFile.value ? stackCanUndo(activeFile.value) : false));
export const canRedo = computed(() => (activeFile.value ? stackCanRedo(activeFile.value) : false));
export const pendingTool = computed(() =>
  tools.value.find((t) => t.view.id === workspace.value.pendingToolId) ?? null,
);
export const busy = computed(() => jobs.value.some((j) => j.status === 'running' || j.status === 'queued'));

/* ------------------------------------------------------------------ */
/* Internals                                                            */
/* ------------------------------------------------------------------ */

let store: SessionStore | null = null;
function db(): SessionStore {
  if (!store) store = getSessionStore();
  return store;
}
export function useSessionStore(s: SessionStore): void {
  store = s;
}

const bytesCache = new Map<string, Uint8Array>();
const BYTES_CACHE_MAX = 6;
function cachePut(ref: string, bytes: Uint8Array): void {
  bytesCache.delete(ref);
  bytesCache.set(ref, bytes);
  while (bytesCache.size > BYTES_CACHE_MAX) {
    const oldest = bytesCache.keys().next().value;
    if (oldest === undefined) break;
    bytesCache.delete(oldest);
  }
}

export async function readRef(ref: string): Promise<Uint8Array | undefined> {
  const cached = bytesCache.get(ref);
  if (cached) return cached;
  const bytes = await db().readBlob(ref);
  if (bytes) cachePut(ref, bytes);
  return bytes;
}

function patch(p: Partial<WorkspaceState>): void {
  workspace.value = { ...workspace.value, ...p };
}

async function persist(session: SessionMeta): Promise<SessionMeta> {
  // Optimistic: publish the new meta *before* the IDB round-trip so concurrent
  // writers (page count from the canvas, findings from analysis, head moves)
  // always build on the latest state instead of overwriting each other.
  if (workspace.value.session?.id === session.id) patch({ session });
  const saved = await db().save(session);
  if (workspace.value.session?.id === saved.id && saved !== session) {
    const cur = workspace.value.session;
    // keep fields that changed meanwhile (updatedAt/bytes come from the store)
    patch({ session: cur ? { ...cur, updatedAt: saved.updatedAt, bytes: saved.bytes } : saved });
  }
  touchRecent(saved);
  return saved;
}

/** Keep the bin's session list in sync without another IDB round-trip. */
function touchRecent(session: SessionMeta): void {
  const steps = session.files.reduce((n, f) => n + f.revisions.filter((r) => r.status === 'ok').length, 0);
  const entry = { id: session.id, name: session.name, updatedAt: session.updatedAt, steps };
  const rest = workspace.value.recent.filter((r) => r.id !== session.id);
  patch({ recent: [entry, ...rest].slice(0, 8) });
}

function updateFile(session: SessionMeta, fileId: string, fn: (f: SessionFileMeta) => SessionFileMeta): SessionMeta {
  return { ...session, files: session.files.map((f) => (f.id === fileId ? fn(f) : f)) };
}

let toastSeq = 0;
export function toast(kind: Toast['kind'], text: string, timeoutMs = kind === 'err' ? 8000 : 4000): void {
  toastSeq += 1;
  const id = `t${toastSeq}`;
  toasts.value = [...toasts.value, { id, kind, text, timeoutMs }];
  if (timeoutMs > 0) setTimeout(() => dismissToast(id), timeoutMs);
}
export function dismissToast(id: string): void {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

let jobsBound = false;
function bindJobs(): void {
  if (jobsBound) return;
  jobsBound = true;
  subscribeJobs((list) => {
    jobs.value = list.map((j) => ({ id: j.id, label: j.label, ratio: j.ratio, message: j.message, status: j.status }));
  });
}

/* ------------------------------------------------------------------ */
/* Session lifecycle                                                    */
/* ------------------------------------------------------------------ */

export async function initWorkspace(opts: {
  locale: Locale;
  tools: WorkspaceToolMeta[];
  sessionId?: string;
  desktop?: boolean;
  policyLabel?: string | null;
}): Promise<void> {
  bindJobs();
  tools.value = opts.tools;
  let session: SessionMeta | null = null;
  if (opts.sessionId) session = (await db().get(opts.sessionId).catch(() => undefined)) ?? null;
  const recent = (await db().list().catch(() => [])).slice(0, 8).map((s) => ({
    id: s.id,
    name: s.name,
    updatedAt: s.updatedAt,
    steps: s.stepCount,
  }));
  batch(() => {
    patch({
      ready: true,
      locale: opts.locale,
      desktop: Boolean(opts.desktop),
      session,
      recent,
      policyLabel: opts.policyLabel ?? null,
      selectedFileIds: [],
      selection: {},
      page: 1,
      ...readLayout(),
    });
  });
  if (session) {
    warmFamily(session.files[0]?.family ?? null);
    syncWorkspaceUrl({ session: session.id, tool: workspace.value.pendingToolId, file: session.activeFileId });
  }
}

/** Tool metadata arrives separately (fetched JSON) so the shell HTML stays small. */
export function setTools(list: WorkspaceToolMeta[]): void {
  tools.value = list;
}

export async function ensureSession(): Promise<SessionMeta> {
  const existing = workspace.value.session;
  if (existing) return existing;
  const created = await db().create();
  patch({ session: created });
  touchRecent(created);
  syncWorkspaceUrl({ session: created.id, tool: workspace.value.pendingToolId });
  return created;
}

export async function openSession(id: string): Promise<boolean> {
  const session = await db().get(id);
  if (!session) return false;
  bytesCache.clear();
  batch(() => {
    patch({ session, selectedFileIds: [], selection: {}, marks: [], page: 1, diffStepId: null });
    headVersion.value += 1;
  });
  syncWorkspaceUrl({ session: session.id, tool: workspace.value.pendingToolId, file: session.activeFileId });
  warmFamily(session.files[0]?.family ?? null);
  return true;
}

export async function newSession(): Promise<void> {
  bytesCache.clear();
  const created = await db().create();
  batch(() => {
    patch({ session: created, selectedFileIds: [], selection: {}, marks: [], page: 1, pendingToolId: null, pendingOptions: {} });
    headVersion.value += 1;
  });
  touchRecent(created);
  syncWorkspaceUrl({ session: created.id });
}

export async function renameSession(name: string): Promise<void> {
  const s = workspace.value.session;
  if (!s) return;
  const next = await db().rename(s.id, name);
  if (next) patch({ session: next });
}

export async function deleteSession(id: string): Promise<void> {
  await db().delete(id);
  if (workspace.value.session?.id === id) {
    bytesCache.clear();
    patch({ session: null, selectedFileIds: [], selection: {}, marks: [] });
    syncWorkspaceUrl({});
  }
  const recent = (await db().list()).slice(0, 5).map((s) => ({ id: s.id, name: s.name, updatedAt: s.updatedAt, steps: s.stepCount }));
  patch({ recent });
}

/* ------------------------------------------------------------------ */
/* Files                                                                */
/* ------------------------------------------------------------------ */

export interface IncomingFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

export async function addIncoming(files: IncomingFile[], opts: { activate?: boolean } = {}): Promise<SessionFileMeta[]> {
  if (!files.length) return [];
  let session = await ensureSession();
  const added: SessionFileMeta[] = [];
  for (const f of files) {
    const claimed = f.mime || guessMime(f.name);
    const sniffed = await sniffMime(f.bytes, f.name, claimed);
    const mime = sniffed.mime || claimed || 'application/octet-stream';
    const res = await db().addFile(session, { name: f.name, mime, bytes: f.bytes });
    if (sniffed.mismatch && sniffed.detected) {
      toast('warn', workspace.value.locale === 'de'
        ? `${f.name}: Inhalt ist ${sniffed.detected}, nicht ${claimed || 'unbekannt'} – Workspace folgt dem Inhalt.`
        : `${f.name}: content is ${sniffed.detected}, not ${claimed || 'unknown'} – workspace follows the content.`);
    }
    session = res.meta;
    cachePut(res.file.srcRef, f.bytes);
    added.push(res.file);
  }
  const first = added[0];
  if (first && (opts.activate ?? true)) {
    if (!pendingFits(first, workspace.value.pendingToolId)) patch({ pendingToolId: null, pendingOptions: {} });
    session = { ...session, activeFileId: first.id };
    session = await persist(session);
  } else {
    patch({ session });
  }
  batch(() => {
    patch({ page: 1, selection: {}, marks: [] });
    headVersion.value += 1;
  });
  syncWorkspaceUrl({ session: session.id, tool: workspace.value.pendingToolId, file: session.activeFileId });
  warmFamily(first?.family ?? null);
  for (const file of added) void analyzeFile(file.id);
  return added;
}

export async function addBrowserFiles(list: File[]): Promise<void> {
  if (!list.length) return;
  try {
    const incoming: IncomingFile[] = [];
    for (const file of list) {
      incoming.push({ name: file.name, mime: file.type || guessMime(file.name), bytes: new Uint8Array(await file.arrayBuffer()) });
    }
    await addIncoming(incoming);
  } catch (err) {
    // never fail silently: storage quota, unreadable file, OPFS unavailable …
    const msg = err instanceof Error ? err.message : String(err);
    toast('err', workspace.value.locale === 'de' ? `Datei konnte nicht geöffnet werden: ${msg}` : `Could not open file: ${msg}`);
  }
}

export async function removeFile(fileId: string): Promise<void> {
  const s = workspace.value.session;
  if (!s) return;
  const next = await db().removeFile(s, fileId);
  batch(() => {
    patch({
      session: next,
      selectedFileIds: workspace.value.selectedFileIds.filter((id) => id !== fileId),
      marks: [],
      selection: {},
      page: 1,
    });
    headVersion.value += 1;
  });
  syncWorkspaceUrl({ session: next.id, tool: workspace.value.pendingToolId, file: next.activeFileId });
}

function pendingFits(file: SessionFileMeta | undefined, toolId: string | null): boolean {
  if (!toolId || !file) return true;
  const t = tools.value.find((x) => x.view.id === toolId);
  if (!t) return true;
  return t.inputs.accept.some((rule) => rule === '*/*' || rule === file.mime || (rule.endsWith('/*') && file.mime.startsWith(rule.slice(0, -1))));
}

export async function activateFile(fileId: string): Promise<void> {
  const s = workspace.value.session;
  if (!s || s.activeFileId === fileId) return;
  if (!pendingFits(s.files.find((f) => f.id === fileId), workspace.value.pendingToolId)) patch({ pendingToolId: null, pendingOptions: {} });
  const next = await persist({ ...s, activeFileId: fileId });
  batch(() => {
    patch({ session: next, page: 1, selection: {}, marks: [], diffStepId: null });
    headVersion.value += 1;
  });
  syncWorkspaceUrl({ session: next.id, tool: workspace.value.pendingToolId, file: fileId });
}

export function toggleSelectFile(fileId: string): void {
  const cur = workspace.value.selectedFileIds;
  patch({ selectedFileIds: cur.includes(fileId) ? cur.filter((id) => id !== fileId) : [...cur, fileId] });
}

export function setSelectedFiles(ids: string[]): void {
  patch({ selectedFileIds: ids });
}

export async function reorderFiles(ids: string[]): Promise<void> {
  const s = workspace.value.session;
  if (!s) return;
  const byId = new Map(s.files.map((f) => [f.id, f]));
  const files = ids.map((id) => byId.get(id)).filter((f): f is SessionFileMeta => Boolean(f));
  for (const f of s.files) if (!ids.includes(f.id)) files.push(f);
  await persist({ ...s, files });
}

export async function setPageCount(fileId: string, pages: number): Promise<void> {
  const s = workspace.value.session;
  if (!s) return;
  const file = s.files.find((f) => f.id === fileId);
  if (!file || file.pages === pages) return;
  await persist(updateFile(s, fileId, (f) => ({ ...f, pages })));
}

/* ------------------------------------------------------------------ */
/* Analysis                                                             */
/* ------------------------------------------------------------------ */

export async function analyzeFile(fileId: string): Promise<Finding[]> {
  const s = workspace.value.session;
  const file = s?.files.find((f) => f.id === fileId);
  if (!s || !file) return [];
  try {
    const ref = await fileRef(file, currentRef(file), currentName(file));
    const findings = await analyzeJob(ref).promise;
    const cur = workspace.value.session;
    if (!cur || !cur.files.some((f) => f.id === fileId)) return findings;
    await persist(updateFile(cur, fileId, (f) => ({ ...f, findings, analyzedAt: Date.now() })));
    return findings;
  } catch {
    // analysis is best-effort: mark as done so the bar never spins forever
    const cur = workspace.value.session;
    if (cur?.files.some((f) => f.id === fileId)) await persist(updateFile(cur, fileId, (f) => ({ ...f, analyzedAt: Date.now() }))).catch(() => undefined);
    return [];
  }
}

export async function dismissFinding(fileId: string, findingId: string): Promise<void> {
  const s = workspace.value.session;
  if (!s) return;
  await persist(updateFile(s, fileId, (f) => ({ ...f, findings: f.findings.filter((x) => x.id !== findingId) })));
}

/* ------------------------------------------------------------------ */
/* Pending tool / options / selection                                   */
/* ------------------------------------------------------------------ */

export function defaultsFrom(fields: FormField[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind === 'object' && f.fields?.length) {
      o[f.name] = {
        ...defaultsFrom(f.fields),
        ...(f.defaultValue && typeof f.defaultValue === 'object' ? (f.defaultValue as Record<string, unknown>) : {}),
      };
      continue;
    }
    if (f.defaultValue !== undefined) o[f.name] = f.defaultValue;
  }
  return o;
}

export function setPendingTool(toolId: string | null, options?: Record<string, unknown>, presetId?: string): void {
  if (!toolId) {
    patch({ pendingToolId: null, pendingOptions: {}, sheet: workspace.value.sheet === 'options' ? null : workspace.value.sheet });
    syncWorkspaceUrl({ session: workspace.value.session?.id, file: workspace.value.session?.activeFileId });
    return;
  }
  const meta = tools.value.find((t) => t.view.id === toolId);
  const preset = meta?.presets.find((p) => p.id === presetId);
  const next = { ...(meta ? defaultsFrom(meta.fields) : {}), ...(preset?.options ?? {}), ...(options ?? {}) };
  batch(() => {
    patch({ pendingToolId: toolId, pendingOptions: next, diffStepId: null });
    if (toolId !== 'pdf-redact') patch({ marks: [] });
  });
  syncWorkspaceUrl({ session: workspace.value.session?.id, tool: toolId, file: workspace.value.session?.activeFileId });
}

export function setPendingOptions(options: Record<string, unknown>): void {
  patch({ pendingOptions: options });
}

export function setSelection(selection: Selection): void {
  patch({ selection });
}

export function setPage(page: number): void {
  const total = activeFile.value?.pages ?? Number.MAX_SAFE_INTEGER;
  patch({ page: Math.max(1, Math.min(total, page)) });
}

export function setZoom(zoom: number): void {
  patch({ zoom: Math.max(0.3, Math.min(4, zoom)) });
}

export function setSearch(search: string): void {
  patch({ search });
}

export function setRedactMode(mode: RedactMode): void {
  patch({ redactMode: mode });
}

export function setMarks(marks: RedactMark[] | ((prev: RedactMark[]) => RedactMark[])): void {
  patch({ marks: typeof marks === 'function' ? marks(workspace.value.marks) : marks });
}

export function setUi(
  p: Partial<Pick<WorkspaceState, 'exportOpen' | 'mergeOpen' | 'batchOpen' | 'paletteOpen' | 'shortcutsOpen' | 'diffStepId' | 'sheet' | 'error' | 'overview' | 'panel' | 'menu'>>,
): void {
  patch(p);
}

export function closeOverlays(): void {
  patch({ exportOpen: false, mergeOpen: false, batchOpen: false, paletteOpen: false, shortcutsOpen: false, sheet: null, diffStepId: null, panel: null, menu: null });
}

/** Anything modal/transient open? (Esc closes these first.) */
export function hasOverlay(s: WorkspaceState = workspace.value): boolean {
  return Boolean(s.paletteOpen || s.exportOpen || s.mergeOpen || s.batchOpen || s.shortcutsOpen || s.diffStepId || s.sheet || s.panel || s.menu);
}

/* ------------------------------------------------------------------ */
/* Steps                                                                */
/* ------------------------------------------------------------------ */

async function fileRef(file: SessionFileMeta, ref: string, name: string): Promise<WorkerFileRef> {
  const size = file.head < 0 ? file.size : file.revisions[file.head]?.outputSize ?? file.size;
  if (size > INLINE_TRANSFER_LIMIT && (await import('./session-store')).opfsInUse()) {
    return { name, mime: file.mime, opfsPath: opfsPathOf(ref) };
  }
  const bytes = await readRef(ref);
  if (!bytes) throw new Error(`Datei nicht gefunden: ${name}`);
  return { name, mime: file.mime, data: bytes };
}

/** Selection → tool options, keyed by the tool's declared form fields (no Zod in the main thread). */
export function applySelectionByFields(
  toolId: string,
  fields: FormField[],
  options: Record<string, unknown>,
  selection: Selection,
): Record<string, unknown> {
  const names = new Set(fields.map((f) => f.name));
  const next = { ...options };
  if (selection.pages?.length) {
    const field = fields.find((f) => f.name === 'pages');
    if (field) next.pages = field.kind === 'string' ? formatPages(selection.pages) : [...selection.pages];
  }
  if (selection.regions?.length && names.has('regions')) {
    next.regions = selection.regions.map((r) => ({ page: r.page ?? 1, x: r.x, y: r.y, w: r.w, h: r.h }));
    if (toolId === 'pdf-redact' && next.mode === 'auto') next.mode = 'both';
  }
  if (selection.timeRange) {
    if (names.has('startSec')) next.startSec = selection.timeRange.startSec;
    if (names.has('endSec')) next.endSec = selection.timeRange.endSec;
  }
  return next;
}

const REPORT_MIMES = new Set(['application/json', 'text/plain', 'text/markdown', 'text/csv', 'text/html', 'application/xml', 'text/xml']);

/**
 * Which output becomes the next document revision: same MIME as the document
 * first; `inspect` tools never replace bytes; otherwise the first non-report
 * output (e.g. compress → PDF, images-to-pdf → PDF).
 */
export function pickPrimaryOutput<T extends { mime: string }>(
  outputs: T[],
  file: Pick<SessionFileMeta, 'mime'>,
  view?: Pick<WorkspaceToolView, 'verb'>,
): T | undefined {
  const same = outputs.find((o) => o.mime === file.mime);
  if (same) return same;
  if (view?.verb === 'inspect') return undefined;
  return outputs.find((o) => !REPORT_MIMES.has(o.mime) && !o.mime.startsWith('text/'));
}

function extractVerification(report: Record<string, unknown> | undefined): VerificationReport | undefined {
  const v = report?.verification as VerificationReport | undefined;
  return v && Array.isArray(v.checks) ? v : undefined;
}

function summarizeReport(report: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!report) return undefined;
  const { verification: _v, provenance: _p, ...rest } = report;
  try {
    const json = JSON.stringify(rest);
    if (json.length > 64_000) return { truncated: true };
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string | undefined> {
  try {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return undefined;
  }
}

export interface RunStepOptions {
  fileId?: string;
  selection?: Selection;
  /** Do not apply the pending selection (batch replay). */
  raw?: boolean;
  label?: string;
}

/**
 * Run one tool on a file's current head and push the result as a new revision.
 * Fails never leave the stack in a running state; canvas stays on the last good head.
 */
export async function runStep(
  toolId: string,
  options: Record<string, unknown>,
  opts: RunStepOptions = {},
): Promise<StepRecord | null> {
  const state = workspace.value;
  const session = state.session;
  const fileId = opts.fileId ?? session?.activeFileId ?? activeFile.value?.id;
  const file = session?.files.find((f) => f.id === fileId);
  if (!session || !file) {
    toast('warn', state.locale === 'de' ? 'Keine Datei gewählt.' : 'No file selected.');
    return null;
  }
  const meta = tools.value.find((t) => t.view.id === toolId);
  const selection = opts.selection ?? (opts.fileId && opts.fileId !== session.activeFileId ? {} : state.selection);
  const finalOptions = opts.raw || !meta ? options : applySelectionByFields(toolId, meta.fields, options, selection);
  const record = newStepRecord(toolId, finalOptions, selection);
  record.status = 'running';

  // 1. push as running
  const stack0 = pushStep(file, record);
  void db().deleteRevisionBlobs(stack0.dropped);
  let s1 = updateFile(session, file.id, (f) => ({ ...f, revisions: stack0.state.revisions, head: stack0.state.head }));
  s1 = await persist(s1);

  try {
    const inputName = currentName(file);
    const ref = await fileRef(file, currentRef(file), inputName);
    if (ref.data) record.inputHash = await sha256Hex(ref.data);
    const job = runToolJob(toolId, [ref], finalOptions, undefined, opts.label ?? meta?.view.title[state.locale] ?? toolId);
    const result = await job.promise;
    const primary = pickPrimaryOutput(result.outputs, file, meta?.view);
    const sidecars: NonNullable<StepRecord['sidecars']> = [];
    let idx = 0;
    for (const o of result.outputs) {
      if (o === primary) continue;
      const key = await db().writeSidecar(session.id, file.id, record.stepId, idx, o.data);
      sidecars.push({ name: o.name, mime: o.mime, ref: key, size: o.data.byteLength });
      idx += 1;
    }
    const verification = extractVerification(result.report);
    const patchRec: Partial<StepRecord> = {
      status: 'ok',
      warnings: result.warnings,
      verification,
      report: summarizeReport(result.report),
      provenance: result.report?.provenance,
      sidecars,
    };
    if (primary) {
      const key = await db().writeRevision(session.id, file.id, record.stepId, primary.data);
      cachePut(key, primary.data);
      Object.assign(patchRec, {
        outputRef: key,
        outputName: primary.name,
        outputMime: primary.mime,
        outputSize: primary.data.byteLength,
        outputHash: await sha256Hex(primary.data),
        snapshot: true,
      });
    } else {
      // report-only step (inspect): keep previous bytes as the "output"
      Object.assign(patchRec, {
        outputRef: currentRef(file),
        outputName: inputName,
        outputMime: file.mime,
        outputSize: file.head < 0 ? file.size : file.revisions[file.head]?.outputSize,
        snapshot: false,
      });
    }
    const cur = workspace.value.session ?? s1;
    let s2 = updateFile(cur, file.id, (f) => ({
      ...f,
      revisions: f.revisions.map((r) => (r.stepId === record.stepId ? { ...r, ...patchRec } : r)),
    }));
    const trimmed = await db().trimSnapshots(s2.files.find((f) => f.id === file.id)!);
    s2 = updateFile(s2, file.id, () => trimmed);
    s2 = await persist(s2);
    batch(() => {
      patch({ session: s2, selection: {}, marks: [], diffStepId: null });
      headVersion.value += 1;
    });
    if (primary && file.id === s2.activeFileId) void analyzeFile(file.id);
    const done = s2.files.find((f) => f.id === file.id)?.revisions.find((r) => r.stepId === record.stepId) ?? null;
    if (verification && (!verification.passed || (verification.warnings?.length ?? 0) > 0)) {
      toast('warn', state.locale === 'de' ? 'Verifikation nicht bestanden — Siegel bleibt aus.' : 'Verification failed — no seal.');
    }
    return done;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const cur = workspace.value.session ?? s1;
    const s2 = updateFile(cur, file.id, (f) => ({
      ...f,
      revisions: f.revisions.map((r) => (r.stepId === record.stepId ? { ...r, status: 'error' as const, error: message } : r)),
      head: Math.max(-1, f.head - 1),
    }));
    await persist(s2);
    if (message !== 'Abgebrochen') toast('err', message);
    return null;
  }
}

/** Apply the pending tool with the pending options on the active file. */
export async function applyPending(): Promise<StepRecord | null> {
  const { pendingToolId, pendingOptions } = workspace.value;
  if (!pendingToolId) return null;
  const marks = workspace.value.marks.filter((m) => m.selected);
  let selection = workspace.value.selection;
  if (pendingToolId === 'pdf-redact' && marks.length) {
    selection = {
      ...selection,
      regions: marks.map((m) => ({ page: m.page, x: m.x, y: m.y, w: m.w, h: m.h, unit: 'pdf' as const })),
    };
  }
  return runStep(pendingToolId, pendingOptions, { selection });
}

/**
 * Ensure the bytes for revision `index` exist (snapshot or replay through the
 * pipeline spec from the original) and return the OPFS ref.
 */
async function materialize(file: SessionFileMeta, index: number): Promise<string> {
  if (index < 0) return file.srcRef;
  const rec = file.revisions[index];
  if (!rec) return file.srcRef;
  if (rec.outputRef && rec.snapshot) return rec.outputRef;
  if (rec.outputRef && rec.status === 'ok' && !rec.snapshot && (await db().readBlob(rec.outputRef))) return rec.outputRef;
  const spec = toPipelineSpec(file.revisions, index);
  const src = await readRef(file.srcRef);
  if (!src) throw new Error('Original fehlt.');
  const session = workspace.value.session!;
  const result = await runPipelineJob(
    { steps: spec.steps.map((s) => ({ toolId: s.toolId, options: s.options })) },
    [{ name: file.name, mime: file.mime, data: src }],
    undefined,
    workspace.value.locale === 'de' ? 'Schritt wiederherstellen' : 'Replaying step',
  ).promise;
  const primary = result.outputs.find((o) => o.mime === file.mime) ?? result.outputs[0];
  if (!primary) throw new Error('Replay ohne Ausgabe.');
  const key = await db().writeRevision(session.id, file.id, rec.stepId, primary.data);
  cachePut(key, primary.data);
  const cur = workspace.value.session ?? session;
  await persist(
    updateFile(cur, file.id, (f) => ({
      ...f,
      revisions: f.revisions.map((r) => (r.stepId === rec.stepId ? { ...r, outputRef: key, snapshot: true, outputSize: primary.data.byteLength } : r)),
    })),
  );
  return key;
}

async function moveHead(next: (f: SessionFileMeta) => number): Promise<void> {
  const s = workspace.value.session;
  const file = activeFile.value;
  if (!s || !file) return;
  const head = next(file);
  if (head === file.head) return;
  try {
    await materialize(file, head);
  } catch (err) {
    toast('err', err instanceof Error ? err.message : String(err));
    return;
  }
  const cur = workspace.value.session ?? s;
  const saved = await persist(updateFile(cur, file.id, (f) => ({ ...f, head })));
  batch(() => {
    patch({ session: saved, selection: {}, marks: [], diffStepId: null });
    headVersion.value += 1;
  });
  void analyzeFile(file.id);
}

export async function undo(): Promise<void> {
  await moveHead((f) => stackUndo(f).head);
}

export async function redo(): Promise<void> {
  await moveHead((f) => stackRedo(f).head);
}

export async function jumpTo(index: number): Promise<void> {
  await moveHead((f) => stackJump(f, index).head);
}

export async function cancelJobs(): Promise<void> {
  const { getWorkerPool } = await import('./pool');
  getWorkerPool().cancelAll();
}

/* ------------------------------------------------------------------ */
/* Pipeline / batch / merge                                             */
/* ------------------------------------------------------------------ */

export function currentPipeline(): PipelineSpec | null {
  const f = activeFile.value;
  if (!f) return null;
  const spec = toPipelineSpec(f.revisions, f.head);
  return spec.steps.length ? spec : null;
}

export function pipelineShareHash(): string | null {
  const spec = currentPipeline();
  return spec ? encodePipelineHash(spec) : null;
}

/** Apply the active file's stack (up to head) to other tray files, one after another per file. */
export async function runBatch(fileIds: string[], onFile?: (fileId: string, ok: boolean) => void): Promise<void> {
  const spec = currentPipeline();
  if (!spec) return;
  await Promise.all(
    fileIds.map(async (fileId) => {
      let ok = true;
      for (const step of spec.steps) {
        const rec = await runStep(step.toolId, step.options as Record<string, unknown>, {
          fileId,
          raw: true,
          selection: step.selection ?? {},
        });
        if (!rec) {
          ok = false;
          break;
        }
      }
      onFile?.(fileId, ok);
    }),
  );
}

/** Merge selected tray files (in the given order) into a new tray file. */
export async function mergeFiles(fileIds: string[], options: Record<string, unknown>): Promise<SessionFileMeta | null> {
  const s = workspace.value.session;
  if (!s || fileIds.length < 2) return null;
  const refs: WorkerFileRef[] = [];
  for (const id of fileIds) {
    const f = s.files.find((x) => x.id === id);
    if (!f) continue;
    refs.push(await fileRef(f, currentRef(f), currentName(f)));
  }
  try {
    const result = await runToolJob('pdf-merge', refs, options, undefined, 'pdf-merge').promise;
    const pdf = result.outputs.find((o) => o.mime === 'application/pdf');
    if (!pdf) throw new Error('Kein PDF.');
    const [added] = await addIncoming([{ name: pdf.name, mime: pdf.mime, bytes: pdf.data }]);
    toast('ok', workspace.value.locale === 'de' ? 'Zusammengeführt — neue Datei im Tray.' : 'Merged — new file in tray.');
    return added ?? null;
  } catch (err) {
    toast('err', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Export                                                               */
/* ------------------------------------------------------------------ */

export interface ExportItem {
  name: string;
  mime: string;
  data: Uint8Array;
}

export async function collectExport(spec: ExportSpec): Promise<ExportItem[]> {
  const s = workspace.value.session;
  if (!s) return [];
  const { provenanceManifest } = await import('./step-stack');
  const targets: SessionFileMeta[] =
    spec.what === 'all'
      ? s.files
      : spec.what === 'selected'
        ? s.files.filter((f) => workspace.value.selectedFileIds.includes(f.id))
        : activeFile.value
          ? [activeFile.value]
          : [];
  const items: ExportItem[] = [];
  for (const f of targets) {
    const bytes = await readRef(currentRef(f));
    if (!bytes) continue;
    const name = targets.length === 1 && spec.name ? spec.name : currentName(f);
    items.push({ name, mime: f.mime, data: bytes });
    if (spec.includeProvenance) {
      items.push({
        name: `${name.replace(/\.[^.]+$/, '')}-provenance.json`,
        mime: 'application/json',
        data: new TextEncoder().encode(JSON.stringify(provenanceManifest(f), null, 2)),
      });
    }
  }
  return items;
}

/** Share-safe traffic light from the head verification (fail-closed; unknown when no verify ran). */
export function shareSafeState(file: SessionFileMeta | null): 'yes' | 'no' | 'unknown' {
  if (!file || file.head < 0) return 'unknown';
  // Walk back over report-only steps (they do not change bytes) until a byte-changing head.
  for (let i = file.head; i >= 0; i--) {
    const rec = file.revisions[i];
    if (!rec || rec.status !== 'ok') continue;
    const light = shareSafeLight(rec);
    if (light) return light === 'green' ? 'yes' : 'no';
    const v = rec.verification;
    if (v) return v.passed && (v.warnings?.length ?? 0) === 0 ? 'yes' : 'no';
    if (rec.snapshot) return 'unknown';
  }
  return 'unknown';
}

/** Traffic light of a `forensics-share-safe` step (report-only), if that is what the record is. */
export function shareSafeLight(rec: StepRecord | undefined): 'green' | 'yellow' | 'red' | null {
  if (!rec || rec.toolId !== 'forensics-share-safe') return null;
  const files = (rec.report as { files?: Array<{ light?: string }> } | undefined)?.files;
  const light = files?.[0]?.light;
  return light === 'green' || light === 'yellow' || light === 'red' ? light : null;
}

/** Share-safe checklist rows of the most recent `forensics-share-safe` step at/below head. */
export function shareSafeChecklist(file: SessionFileMeta | null): Array<{ id: string; label: Record<string, string>; present: boolean; severity: string }> {
  if (!file) return [];
  for (let i = file.head; i >= 0; i--) {
    const rec = file.revisions[i];
    if (!rec || rec.status !== 'ok') continue;
    if (rec.toolId === 'forensics-share-safe') {
      const files = (rec.report as { files?: Array<{ checklist?: Array<{ id: string; label: Record<string, string>; present: boolean; severity: string }> }> } | undefined)?.files;
      return files?.[0]?.checklist ?? [];
    }
    if (rec.snapshot) return [];
  }
  return [];
}

/* ------------------------------------------------------------------ */

export function guessMime(name: string): string {
  const lower = name.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf('.'));
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.zip': 'application/zip',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.txt': 'text/plain',
  };
  return map[ext] ?? 'application/octet-stream';
}

export function familyOf(file: SessionFileMeta | null): ReturnType<typeof familyForMime> {
  return file ? file.family ?? familyForMime(file.mime) : null;
}

/** Workspace kind shown in the shell (splits media into audio/video, null → 'unknown'). */
export function kindOf(file: SessionFileMeta | null): WorkspaceKind {
  return file ? workspaceKind(file.mime, familyOf(file)) : 'unknown';
}
