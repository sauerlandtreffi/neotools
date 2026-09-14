import { useEffect, useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { w } from '../../lib/workspace/i18n';
import { parseWorkspaceQuery } from '../../lib/workspace/router';
import {
  activeFile,
  activateFile,
  addBrowserFiles,
  addIncoming,
  applyPending,
  closeOverlays,
  hasOverlay,
  initWorkspace,
  kindOf,
  newSession,
  redo,
  removeFile,
  setLayout,
  setPage,
  setPendingTool,
  setRedactMode,
  setSelection,
  setTools,
  setUi,
  setZoom,
  tools,
  undo,
  workspace,
  type Sheet,
  type WorkspaceToolMeta,
} from '../../lib/workspace/store';
import ActionBar from './ActionBar';
import BatchOverlay from './BatchOverlay';
import DiffView from './DiffView';
import EmptyState from './EmptyState';
import ExportDrawer from './ExportDrawer';
import FileTray from './FileTray';
import FindingBar from './FindingBar';
import GenericCanvas from './GenericCanvas';
import { I } from './Icons';
import { setTheme } from './MenuBar';
import MergeOverlay from './MergeOverlay';
import OptionsPanel from './OptionsPanel';
import Palette from './Palette';
import PanelHost from './PanelHost';
import PdfCanvas from './PdfCanvas';
import ShortcutsHelp from './ShortcutsHelp';
import StatusBar from './StatusBar';
import StepStack from './StepStack';
import ThumbRail from './ThumbRail';
import Toasts from './Toasts';
import TopBar from './TopBar';

interface Props {
  locale: Locale;
  brandName: string;
  logo: string;
  policyLabel?: string | null;
  /** Inline tool metadata (tests / small builds). Otherwise fetched from `toolsUrl`. */
  toolsJson?: string;
  toolsUrl?: string;
  /** Embedded above the fold on `/`: not expanded until a file arrives. */
  embedded?: boolean;
  /** Deep-link: pre-select this tool and expand. */
  initialTool?: string;
  licensePubkey?: string;
  licenseEmbedded?: string;
}

interface LaunchQueueLike {
  setConsumer(cb: (params: { files: Array<{ getFile(): Promise<File> }> }) => void): void;
}

/** Program shell (pivot §11): menu bar · bin · canvas · inspector · status bar. */
export default function WorkspaceApp({
  locale,
  brandName,
  logo,
  policyLabel,
  toolsJson,
  toolsUrl = '/workspace-tools.json',
  embedded = false,
  initialTool,
  licensePubkey = '',
  licenseEmbedded = '',
}: Props) {
  const s = workspace.value;
  const file = activeFile.value;
  const [trayOpen, setTrayOpen] = useState(false);

  // boot: parse query, load session, load tool metadata, handle desktop/PWA/handoff sources
  useEffect(() => {
    const q = parseWorkspaceQuery(location.search, location.hash);
    const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
    let disposed = false;
    const unlisten: Array<() => void> = [];
    const wantedTool = q.tool ?? initialTool ?? null;
    (async () => {
      const inline = toolsJson ? (JSON.parse(toolsJson) as WorkspaceToolMeta[]) : null;
      await initWorkspace({ locale, tools: inline ?? [], sessionId: q.session, desktop: isTauri, policyLabel: policyLabel ?? null });
      if (disposed) return;
      if (q.panel === 'history' || q.panel === 'pipeline' || q.panel === 'watch') setUi({ panel: q.panel });
      if (!inline) {
        try {
          const res = await fetch(toolsUrl, { credentials: 'same-origin' });
          if (res.ok) setTools((await res.json()) as WorkspaceToolMeta[]);
        } catch {
          // offline without cache: the shell still works for drop/persist; tools appear once online
        }
        if (disposed) return;
      }
      const list = tools.value;
      if (wantedTool && list.some((t) => t.view.id === wantedTool)) setPendingTool(wantedTool, q.options, q.preset);
      if (q.file && workspace.value.session?.files.some((f) => f.id === q.file)) await activateFile(q.file);
      if (q.selection.pages?.length) setSelection({ pages: q.selection.pages });
      if (q.selection.pages?.[0]) setPage(q.selection.pages[0]);

      // Tauri: file opened via double-click / open-file event
      if (isTauri) {
        const { getDesktop } = await import('../../lib/desktop');
        const desktop = await getDesktop();
        if (q.desktop) {
          const opened = await desktop.readOpenedFile();
          if (opened) await addIncoming([{ name: opened.name, mime: '', bytes: opened.bytes }]);
        }
        unlisten.push(
          await desktop.listenOpenFile(async (notice) => {
            try {
              const f = await desktop.readFile(notice.path);
              await addIncoming([{ name: f.name, mime: '', bytes: f.bytes }]);
            } catch {
              // ignore
            }
          }),
        );
      }
      // PWA file handler / share target handoff slot
      if (q.handoff) {
        const { takeHandoff } = await import('../../lib/desktop-handoff');
        const h = await takeHandoff();
        if (h) {
          await addIncoming([{ name: h.name, mime: h.mime, bytes: h.bytes }]);
          if (h.toolId) setPendingTool(h.toolId);
        }
      }
      const lq = (window as unknown as { launchQueue?: LaunchQueueLike }).launchQueue;
      if (lq) {
        lq.setConsumer(async (params) => {
          const files = await Promise.all(params.files.map((h) => h.getFile()));
          await addBrowserFiles(files);
        });
      }
    })().catch(() => undefined);
    return () => {
      disposed = true;
      for (const off of unlisten) off();
    };
  }, []);

  // "Try it in the workspace" buttons below the fold dispatch files here (pivot §11.1/5).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ files?: File[]; tool?: string }>).detail;
      if (!d) return;
      setUi({ overview: false });
      if (d.tool) setPendingTool(d.tool);
      if (d.files?.length) void addBrowserFiles(d.files);
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    window.addEventListener('neotools:open', onOpen);
    return () => window.removeEventListener('neotools:open', onOpen);
  }, []);

  // global drop + paste + shortcuts
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      setUi({ overview: false });
      void addBrowserFiles(Array.from(e.dataTransfer.files));
    };
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      setUi({ overview: false });
      void addBrowserFiles(files);
    };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      const st = workspace.value;
      const key = e.key.toLowerCase();
      if (mod && key === 'k') {
        e.preventDefault();
        setUi({ paletteOpen: !st.paletteOpen });
        return;
      }
      if (e.key === 'Escape') {
        if (hasOverlay(st)) {
          closeOverlays();
        } else if (st.selection.pages?.length) {
          setSelection({});
        } else if (st.pendingToolId) {
          setPendingTool(null);
        } else if (embedded && st.session?.files.length && !st.overview) {
          setUi({ overview: true });
        }
        return;
      }
      if (typing) {
        if (mod && e.key === 'Enter') {
          e.preventDefault();
          void applyPending();
        }
        return;
      }
      if (mod && e.shiftKey && key === 'n') {
        e.preventDefault();
        void newSession();
        return;
      }
      if (mod && e.shiftKey && key === 'h') {
        e.preventDefault();
        setUi({ panel: st.panel === 'history' ? null : 'history' });
        return;
      }
      if (mod && e.shiftKey && key === 'l') {
        e.preventDefault();
        setTheme(!document.documentElement.classList.contains('dark'));
        return;
      }
      if (mod && key === 'z') {
        e.preventDefault();
        void (e.shiftKey ? redo() : undo());
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        void redo();
        return;
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        void applyPending();
        return;
      }
      if (mod && key === 'e') {
        e.preventDefault();
        if (activeFile.value) setUi({ exportOpen: true });
        return;
      }
      if (mod && key === 'b') {
        e.preventDefault();
        setLayout({ binOpen: !st.binOpen });
        return;
      }
      if (mod && key === 'j') {
        e.preventDefault();
        setLayout({ inspectorOpen: !st.inspectorOpen });
        return;
      }
      if (mod && key === 'w' && activeFile.value) {
        e.preventDefault();
        void removeFile(activeFile.value.id);
        return;
      }
      if (mod && key === 'a' && activeFile.value?.pages) {
        e.preventDefault();
        setSelection({ pages: Array.from({ length: activeFile.value.pages }, (_, i) => i + 1) });
        return;
      }
      if (mod && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        const target = st.session?.files[Number(e.key) - 1];
        if (target) {
          e.preventDefault();
          void activateFile(target.id);
        }
        return;
      }
      if (mod && key === 'o') {
        e.preventDefault();
        (document.querySelector('[data-tray-input],[data-empty-input]') as HTMLInputElement | null)?.click();
        return;
      }
      if (mod) return;
      if (e.key === '?') {
        e.preventDefault();
        setUi({ shortcutsOpen: true });
      } else if (e.key === '/') {
        e.preventDefault();
        (document.querySelector('[data-search-open]') as HTMLButtonElement | null)?.click();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        setPage(st.page + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setPage(st.page - 1);
      } else if (e.key === '+' || e.key === '=') {
        setZoom(st.zoom + 0.15);
      } else if (e.key === '-') {
        setZoom(st.zoom - 0.15);
      } else if (e.key === '0') {
        setZoom(1);
      } else if (st.pendingToolId === 'pdf-redact' && key === 't') {
        setRedactMode('text');
      } else if (st.pendingToolId === 'pdf-redact' && key === 'r') {
        setRedactMode('rect');
      }
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKey);
    };
  }, [embedded]);

  const hasFiles = Boolean(s.session?.files.length);
  const expanded = !embedded || (!s.overview && (hasFiles || Boolean(s.pendingToolId)));

  // expanded ⇒ the page below disappears and body scroll is locked (pivot §11.1/2)
  useEffect(() => {
    if (!embedded) return;
    const html = document.documentElement;
    html.toggleAttribute('data-ws-expanded', expanded);
    if (expanded) window.scrollTo({ top: 0, behavior: 'auto' });
    return () => html.removeAttribute('data-ws-expanded');
  }, [embedded, expanded]);

  const kind = kindOf(file);
  const hasPending = Boolean(s.pendingToolId && tools.value.some((t) => t.view.id === s.pendingToolId));
  const pendingMeta = hasPending ? tools.value.find((t) => t.view.id === s.pendingToolId) : undefined;
  const sheet: Sheet = s.sheet;

  return (
    <div
      class="ws-root"
      data-workspace
      data-ready={s.ready}
      data-embedded={embedded}
      data-expanded={expanded}
      data-kind={kind}
      data-family={kind}
      data-has-files={hasFiles}
    >
      <a href="#ws-doc" class="skip-link">
        {w(locale, 'skip')}
      </a>
      <TopBar locale={locale} brandName={brandName} logo={logo} showTagline={!expanded} onToggleTray={() => setTrayOpen((v) => !v)} />
      <div class="ws-body" data-tray-open={trayOpen} data-bin={s.binOpen} data-inspector={s.inspectorOpen}>
        <div class="ws-tray-col" data-open={trayOpen} onClick={(e) => e.target === e.currentTarget && setTrayOpen(false)}>
          <FileTray locale={locale} onClose={() => setTrayOpen(false)} />
        </div>
        <main class="ws-main" id="ws-doc" tabIndex={-1}>
          {!hasFiles ? (
            <EmptyState locale={locale} />
          ) : (
            <>
              <ActionBar locale={locale} />
              <FindingBar locale={locale} />
              <div class="ws-doc-row">
                {kind === 'pdf' && <ThumbRail locale={locale} />}
                {kind === 'pdf' ? <PdfCanvas locale={locale} /> : <GenericCanvas locale={locale} />}
              </div>
            </>
          )}
        </main>
        <aside class="ws-side" data-sheet={sheet} aria-label={w(locale, 'inspector')}>
          {hasPending && hasFiles ? (
            <OptionsPanel locale={locale} onClose={() => setUi({ sheet: null })} />
          ) : (
            <section class="ws-inspector-empty" data-inspector-hint>
              <header class="ws-panel-head">
                <span class="ws-panel-title">{w(locale, 'inspector')}</span>
              </header>
              <p class="ws-inspector-lead">
                {pendingMeta ? pendingMeta.view.description[locale] : hasFiles ? w(locale, 'inspectorNoTool') : w(locale, 'inspectorEmpty')}
              </p>
              {pendingMeta && !hasFiles && (
                <p class="ws-inspector-tool">
                  <I.wand size={13} /> {pendingMeta.view.title[locale]}
                </p>
              )}
            </section>
          )}
          {hasFiles && <StepStack locale={locale} onClose={() => setUi({ sheet: null })} />}
        </aside>
      </div>
      <StatusBar locale={locale} showScrollHint={embedded && !expanded} />
      {hasFiles && (
        <nav class="ws-tabbar ws-only-mobile" aria-label="Workspace">
          <button type="button" class="ws-tab" data-on={trayOpen} onClick={() => setTrayOpen((v) => !v)}>
            <I.file size={18} />
            <span>{w(locale, 'bin')}</span>
          </button>
          <button type="button" class="ws-tab" data-on={sheet === 'options'} onClick={() => setUi({ sheet: sheet === 'options' ? null : 'options' })}>
            <I.layers size={18} />
            <span>{w(locale, 'options')}</span>
          </button>
          <button type="button" class="ws-tab" data-on={sheet === 'stack'} onClick={() => setUi({ sheet: sheet === 'stack' ? null : 'stack' })}>
            <I.undo size={18} />
            <span>{w(locale, 'stack')}</span>
          </button>
          <button type="button" class="ws-tab" onClick={() => setUi({ exportOpen: true })}>
            <I.export size={18} />
            <span>{w(locale, 'export')}</span>
          </button>
        </nav>
      )}
      <Toasts />
      <ExportDrawer locale={locale} />
      <MergeOverlay locale={locale} />
      <BatchOverlay locale={locale} />
      <Palette locale={locale} />
      <ShortcutsHelp locale={locale} />
      {s.panel && <PanelHost locale={locale} panel={s.panel} licensePubkey={licensePubkey} licenseEmbedded={licenseEmbedded} />}
      {s.diffStepId && <DiffView locale={locale} />}
    </div>
  );
}
